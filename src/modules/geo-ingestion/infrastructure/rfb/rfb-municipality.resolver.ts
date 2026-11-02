import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { MunicipalityInput } from '../../domain/establishment.types';
import { normalizeName, ufToIbgeCode } from './rfb-cnpj.mapper';

/** Below this trigram score a similarity match is a guess, not a translation. */
const MIN_SIMILARITY = 0.5;

/**
 * TOM codes whose name in `Municipios.zip` cannot be matched by name: the IBGE
 * renamed the municipality, or the spelling is too short for a trigram match
 * (`ares` against `arez` scores 0.43). Keyed by TOM because a name is not unique
 * across states.
 */
const ALIASED_CODES: Record<string, string> = {
  /** `BOA SAUDE` → Januário Cicco (RN), renamed in 1943. */
  '1703': '2405306',
  /** `ARES` → Arez (RN). */
  '1623': '2401206',
  /** `FORTALEZA DO TABOCAO` → Tabocão (TO), renamed. */
  '0345': '1708254',
  /** `SAO VALERIO DA NATIVIDADE` → São Valério (TO), renamed. */
  '9691': '1720499',
};

interface IbgeMunicipalityRow {
  ibge_code: string;
  search_name: string;
  uf: string;
}

interface SimilarityRow {
  uf: string;
  ibge_code: string;
  score: number;
}

/**
 * Translates the Receita Federal `TOM` code into the IBGE municipality code.
 *
 * The two are unrelated numberings: `7107` is São Paulo for the RFB while the
 * IBGE code is `3550308`, so one cannot be derived from the other. The bridge is
 * the municipality name published in `Municipios.zip`, matched against
 * `geo.region` — exactly by name plus state, and by trigram similarity inside the
 * establishment's state for the spellings the RFB uses.
 */
@Injectable()
export class RfbMunicipalityResolver {
  private readonly logger = new Logger('RfbMunicipalityResolver');
  /** TOM code → RFB name, in the normalized comparable form. */
  private readonly searchByTom = new Map<string, string>();
  /** `search_name|uf` → IBGE code. */
  private readonly byNameAndState = new Map<string, string>();
  /** `tom|uf` → IBGE code, for the names the exact comparison cannot reach. */
  private readonly byTomAndState = new Map<string, string>();
  /** TOM code → IBGE code, for the municipalities the IBGE renamed. */
  private readonly aliased = new Map<string, string>();

  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  /**
   * Indexes the RFB municipalities against the IBGE ones already in the database.
   * @param municipalities - Rows read from `Municipios.zip`.
   */
  async load(municipalities: MunicipalityInput[]): Promise<void> {
    const { rows } = await sql<IbgeMunicipalityRow>`
      SELECT m.ibge_code, m.search_name, s.ibge_code AS uf
      FROM geo.region m
      JOIN geo.region s ON s.id = m.parent_id
      WHERE m.level = 'municipality' AND s.level = 'state'
    `.execute(this.db);

    if (rows.length === 0) {
      throw new Error('geo.region has no municipality; the IBGE malha has to be published first');
    }

    for (const row of rows) {
      this.byNameAndState.set(`${normalizeName(row.search_name)}|${row.uf}`, row.ibge_code);
    }

    for (const municipality of municipalities) {
      this.searchByTom.set(municipality.tomCode, normalizeName(municipality.name));
    }

    const aliases = this.applyAliases();
    const guesses = await this.loadSimilarities(municipalities);

    this.logger.log(
      `Municipalities: ${municipalities.length} RFB codes against ${rows.length} IBGE ones, ` +
        `${aliases} by alias and ${guesses} by similarity`,
    );
  }

  /**
   * IBGE code of an establishment address.
   * @param tomCode - Receita Federal municipality code.
   * @param uf - Two-letter state of the establishment.
   * @returns The 7-digit IBGE code, or null when it cannot be resolved safely.
   */
  resolve(tomCode: string | null, uf: string | null): string | null {
    const state = ufToIbgeCode(uf);
    if (tomCode === null || state === null) return null;

    const search = this.searchByTom.get(tomCode);
    if (search === undefined) return null;

    return (
      this.aliased.get(tomCode) ??
      this.byNameAndState.get(`${search}|${state}`) ??
      this.byTomAndState.get(`${tomCode}|${state}`) ??
      null
    );
  }

  /**
   * Applies the TOM codes the name comparison cannot reach.
   * @returns How many codes were translated by the table.
   */
  private applyAliases(): number {
    for (const [tomCode, code] of Object.entries(ALIASED_CODES)) {
      if (!this.searchByTom.has(tomCode)) continue;

      this.aliased.set(tomCode, code);
      this.logger.log(`Municipality ${tomCode} "${this.searchByTom.get(tomCode)}" is ${code}`);
    }

    return this.aliased.size;
  }

  /**
   * Finds the closest IBGE name **inside each state**. A single national match is
   * not enough: `SAO LUIZ` is São Luís (MA) and São Luiz (RR), and only the
   * establishment's UF tells them apart. Each guess is logged, because it has to
   * stay auditable.
   * @returns How many state matches were indexed.
   */
  private async loadSimilarities(municipalities: MunicipalityInput[]): Promise<number> {
    let indexed = 0;

    for (const municipality of municipalities) {
      const search = this.searchByTom.get(municipality.tomCode);
      if (search === undefined) continue;

      const { rows } = await sql<SimilarityRow>`
        SELECT s.ibge_code AS uf, m.ibge_code, similarity(m.search_name, ${search}) AS score
        FROM geo.region m
        JOIN geo.region s ON s.id = m.parent_id
        WHERE m.level = 'municipality'
          AND s.level = 'state'
          AND m.search_name % ${search}
        ORDER BY score DESC
      `.execute(this.db);

      const bestByState = new Map<string, SimilarityRow>();
      for (const row of rows) {
        if (row.score < MIN_SIMILARITY) continue;

        const current = bestByState.get(row.uf);
        if (!current || row.score > current.score) bestByState.set(row.uf, row);
      }

      for (const [state, best] of bestByState) {
        const exact = this.byNameAndState.get(`${search}|${state}`);
        if (exact !== undefined) continue;

        this.byTomAndState.set(`${municipality.tomCode}|${state}`, best.ibge_code);
        indexed += 1;
        this.logger.log(
          `Municipality ${municipality.tomCode} "${municipality.name}" → ${best.ibge_code} ` +
            `(${state}) by similarity ${best.score.toFixed(2)}`,
        );
      }
    }

    return indexed;
  }
}
