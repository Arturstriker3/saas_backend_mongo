import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { MunicipalityInput } from '../../domain/establishment.types';
import { normalizeName, ufToIbgeCode } from './rfb-cnpj.mapper';

/** Below this trigram score a fuzzy name match is a guess, not a translation. */
const MIN_SIMILARITY = 0.5;

/**
 * TOM codes whose name in `Municipios.zip` is a legacy one: the IBGE renamed the
 * municipality and the RFB kept the old spelling, so no name comparison can find
 * it. Keyed by TOM because a name is not unique across states.
 */
const LEGACY_NAMES: Record<string, string> = {
  /** `BOA SAUDE` → Januário Cicco (RN), renamed in 1943. */
  '1703': '2405306',
};

interface IbgeMunicipalityRow {
  ibge_code: string;
  search_name: string;
  uf: string;
}

/**
 * Translates the Receita Federal `TOM` code into the IBGE municipality code.
 *
 * The two are unrelated numberings: `7107` is São Paulo for the RFB while the
 * IBGE code is `3550308`, so the TOM cannot be derived from the IBGE code and
 * vice versa. The bridge is the municipality name published in `Municipios.zip`,
 * matched against `geo.region` — exactly when the name is unique in the country,
 * and by name plus state otherwise. The few names the RFB spells differently
 * (`SAO LUIZ` for `São Luís`) are matched by trigram similarity.
 */
@Injectable()
export class RfbMunicipalityResolver {
  private readonly logger = new Logger('RfbMunicipalityResolver');
  /** TOM code → RFB name, in the normalized comparable form. */
  private readonly searchByTom = new Map<string, string>();
  /** `search_name|uf` → IBGE code, for names that repeat across states. */
  private readonly byNameAndState = new Map<string, string>();
  /** `ibge_code` → its state IBGE code, to reject a match in the wrong state. */
  private readonly stateByMunicipality = new Map<string, string>();
  /** TOM code → IBGE code resolved ahead of the stream, when the name is unique. */
  private readonly byTom = new Map<string, string>();

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

    const ibgeBySearchName = new Map<string, string[]>();
    for (const row of rows) {
      const search = normalizeName(row.search_name);
      this.byNameAndState.set(`${search}|${row.uf}`, row.ibge_code);
      this.stateByMunicipality.set(row.ibge_code, row.uf);
      ibgeBySearchName.set(search, [...(ibgeBySearchName.get(search) ?? []), row.ibge_code]);
    }

    for (const municipality of municipalities) {
      const search = normalizeName(municipality.name);
      this.searchByTom.set(municipality.tomCode, search);

      const candidates = ibgeBySearchName.get(search) ?? [];
      if (candidates.length === 1 && candidates[0]) {
        this.byTom.set(municipality.tomCode, candidates[0]);
      }
    }

    const aliases = this.applyLegacyNames(municipalities);
    const fuzzy = await this.resolveSpellings(municipalities, ibgeBySearchName);

    this.logger.log(
      `Municipalities: ${municipalities.length} RFB codes against ${rows.length} IBGE ones, ` +
        `${aliases} by legacy name and ${fuzzy} by similarity`,
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

    const code = this.byTom.get(tomCode) ?? this.byNameAndState.get(`${search}|${state}`) ?? null;

    // A name that exists in another state would publish the wrong city.
    if (code !== null && this.stateByMunicipality.get(code) !== state) return null;

    return code;
  }

  /**
   * Applies the TOM codes whose published name the IBGE no longer uses.
   * @returns How many codes were translated by the table.
   */
  private applyLegacyNames(municipalities: MunicipalityInput[]): number {
    let applied = 0;

    for (const municipality of municipalities) {
      const code = LEGACY_NAMES[municipality.tomCode];
      if (code === undefined || this.byTom.has(municipality.tomCode)) continue;

      this.byTom.set(municipality.tomCode, code);
      applied += 1;
      this.logger.log(
        `Municipality ${municipality.tomCode} "${municipality.name}" is a legacy name for ${code}`,
      );
    }

    return applied;
  }

  /**
   * Matches the names the RFB spells differently from the IBGE (`SAO LUIZ` for
   * `São Luís`). Every match is logged, because a guess has to stay auditable.
   */
  private async resolveSpellings(
    municipalities: MunicipalityInput[],
    ibgeBySearchName: Map<string, string[]>,
  ): Promise<number> {
    const pending = municipalities.filter((municipality) => !this.byTom.has(municipality.tomCode));
    let matched = 0;

    for (const municipality of pending) {
      const search = normalizeName(municipality.name);
      // The name repeats across states, so there is nothing to guess: `resolve`
      // disambiguates it with the establishment's UF.
      if (this.isAmbiguous(search, ibgeBySearchName)) continue;

      const { rows } = await sql<{ ibge_code: string; score: number }>`
        SELECT m.ibge_code, similarity(m.search_name, ${search}) AS score
        FROM geo.region m
        WHERE m.level = 'municipality'
        ORDER BY score DESC
        LIMIT 1
      `.execute(this.db);

      const best = rows[0];
      if (!best || best.score < MIN_SIMILARITY) continue;

      this.byTom.set(municipality.tomCode, best.ibge_code);
      matched += 1;
      this.logger.log(
        `Municipality ${municipality.tomCode} "${municipality.name}" matched to ` +
          `${best.ibge_code} by similarity ${best.score.toFixed(2)}`,
      );
    }

    return matched;
  }

  private isAmbiguous(search: string, ibgeBySearchName: Map<string, string[]>): boolean {
    return (ibgeBySearchName.get(search)?.length ?? 0) > 1;
  }
}
