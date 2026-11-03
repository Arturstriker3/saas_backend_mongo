import { Injectable } from '@nestjs/common';
import type { CnaeDivisionInput, EmploymentRecord } from '../../domain/employment.types';

const CEMPRE_AGREGADO_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados/9418';
const CNAE_CLASSIFICATION = '12762';
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 3;
/** SIDRA variable ids, in the order they are read. */
const VARIABLES = {
  companies: '2585',
  occupiedPersons: '707',
  salariedPersons: '708',
  salariesThousandBrl: '662',
} as const;
const FIELD_BY_VARIABLE: Record<string, keyof Omit<EmploymentRecord, 'municipalityCode' | 'cnaeCode'>> = {
  [VARIABLES.companies]: 'companies',
  [VARIABLES.occupiedPersons]: 'occupiedPersons',
  [VARIABLES.salariedPersons]: 'salariedPersons',
  [VARIABLES.salariesThousandBrl]: 'salariesThousandBrl',
};
/** `01 Agricultura, pecuária e serviços relacionados` — only the two-digit level. */
const DIVISION = /^(\d{2})\s+(.+)$/;

interface IbgePeriod {
  id: string;
}

interface IbgeClassification {
  id: string;
  nome: string;
  categoria: Record<string, string>;
}

interface IbgeSeries {
  localidade: { id: string; nome: string };
  serie: Record<string, string>;
}

interface IbgeResult {
  classificacoes: IbgeClassification[];
  series: IbgeSeries[];
}

interface IbgeVariable {
  id: string;
  variavel: string;
  resultados: IbgeResult[];
}

export interface CempDivision extends CnaeDivisionInput {
  /** Internal SIDRA id of the category, used to filter the next requests. */
  categoryId: string;
}

/**
 * Reads the IBGE Cadastro Central de Empresas (SIDRA aggregate 9418).
 *
 * The API refuses a request that crosses every CNAE category with every
 * municipality — it answers 500 — so the extraction is one division at a time,
 * each carrying all 5 570 municipalities and the four variables at once.
 */
@Injectable()
export class CempreClient {
  /** Latest period the aggregate publishes, e.g. `2024`. */
  async findLatestPeriod(): Promise<string> {
    const periods = await this.getJson<IbgePeriod[]>(`${CEMPRE_AGREGADO_URL}/periodos`);
    const latest = periods.at(-1)?.id;

    if (!latest) throw new Error('IBGE returned no CEMPRE period');

    return latest;
  }

  /**
   * Lists the CNAE divisions with the internal id each one has in SIDRA. The
   * category names carry the code (`01 Agricultura…`), the ids are opaque.
   * @param period - Reference year.
   * @returns The divisions, ordered by code.
   */
  async fetchDivisions(period: string): Promise<CempDivision[]> {
    const url =
      `${CEMPRE_AGREGADO_URL}/periodos/${period}/variaveis/${VARIABLES.companies}` +
      `?localidades=N1%5Ball%5D&classificacao=${CNAE_CLASSIFICATION}%5Ball%5D`;

    const payload = await this.getJson<IbgeVariable[]>(url);
    const divisions = new Map<string, CempDivision>();

    for (const result of payload.flatMap((variable) => variable.resultados)) {
      for (const [categoryId, name] of Object.entries(result.classificacoes[0]?.categoria ?? {})) {
        const parsed = DIVISION.exec(name);
        if (!parsed) continue;

        const [, code, label] = parsed;
        if (!code || !label || divisions.has(code)) continue;
        divisions.set(code, { code, name: label.trim(), categoryId });
      }
    }

    return [...divisions.values()].sort((left, right) => left.code.localeCompare(right.code));
  }

  /**
   * Reads every municipality of one division.
   * @param period - Reference year.
   * @param division - Division and its SIDRA category id.
   * @returns One row per municipality that reports something.
   */
  async fetchDivision(
    period: string,
    division: CempDivision,
  ): Promise<EmploymentRecord[]> {
    const variables = Object.values(VARIABLES).join(',');
    const url =
      `${CEMPRE_AGREGADO_URL}/periodos/${period}/variaveis/${variables}` +
      `?localidades=N6%5Ball%5D` +
      `&classificacao=${CNAE_CLASSIFICATION}%5B${division.categoryId}%5D`;

    const payload = await this.getJson<IbgeVariable[]>(url);
    const byMunicipality = new Map<string, EmploymentRecord>();

    for (const variable of payload) {
      const field = FIELD_BY_VARIABLE[variable.id];
      if (!field) continue;

      for (const result of variable.resultados) {
        for (const item of result.series) {
          const municipalityCode = item.localidade.id;
          if (!municipalityCode) continue;

          const row = byMunicipality.get(municipalityCode) ?? emptyRecord(municipalityCode, division.code);
          row[field] = toNumber(item.serie[period]) ?? 0;
          byMunicipality.set(municipalityCode, row);
        }
      }
    }

    // A division with no company in the municipality is not worth a row.
    return [...byMunicipality.values()].filter(
      (row) => row.companies > 0 || row.occupiedPersons > 0,
    );
  }

  private async getJson<T>(url: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) {
          throw new Error(`IBGE request failed with status ${response.status}: ${url}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) await sleep(2_000 * attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

function emptyRecord(municipalityCode: string, cnaeCode: string): EmploymentRecord {
  return {
    municipalityCode,
    cnaeCode,
    companies: 0,
    occupiedPersons: 0,
    salariedPersons: 0,
    salariesThousandBrl: 0,
  };
}

/** The API uses `-`, `...` and `X` for missing values. */
function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === '' || value === '-' || value === '...' || value === 'X') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
