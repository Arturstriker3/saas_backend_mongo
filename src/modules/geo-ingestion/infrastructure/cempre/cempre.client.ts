import { Injectable } from '@nestjs/common';
import type {
  CnaeCategoryInput,
  EmploymentRecord,
  EmploymentTotalRecord,
} from '../../domain/employment.types';

const CEMPRE_AGREGADO_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados/9418';
const CNAE_CLASSIFICATION = '12762';
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 3;
/**
 * Two classes per request is the ceiling: three already answer 500, because the
 * call crosses five thousand municipalities.
 */
const CLASSES_PER_REQUEST = 2;
/** SIDRA variable ids, in the order they are read. */
const VARIABLES = {
  companies: '2585',
  occupiedPersons: '707',
  salariedPersons: '708',
  salariesThousandBrl: '662',
} as const;
const FIELD_BY_VARIABLE: Record<
  string,
  keyof Omit<EmploymentRecord, 'municipalityCode' | 'cnaeCode'>
> = {
  [VARIABLES.companies]: 'companies',
  [VARIABLES.occupiedPersons]: 'occupiedPersons',
  [VARIABLES.salariedPersons]: 'salariedPersons',
  [VARIABLES.salariesThousandBrl]: 'salariesThousandBrl',
};
/** `47.81-4 Comércio varejista de artigos do vestuário e acessórios`. */
const CLASS = /^(\d{2})\.(\d{2})-\d\s+(.+)$/;

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

export interface CempCategory extends CnaeCategoryInput {
  /** Internal SIDRA id of the category, used to filter the next requests. */
  categoryId: string;
}

/**
 * Reads the IBGE Cadastro Central de Empresas (SIDRA aggregate 9418) at the CNAE
 * class level.
 *
 * The payload mixes every level of the classification (section, division, group
 * and class are all categories of 12762) and the category ids are opaque: only
 * the name carries the code. The adapter reads the national total once to map
 * `47.81-4 Comércio varejista de artigos do vestuário…` to an id and then asks
 * for two classes at a time with all municipalities.
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
   * Lists the CNAE classes with the internal id each one has in SIDRA.
   * @param period - Reference year.
   * @returns The classes, ordered by code.
   */
  async fetchCategories(period: string): Promise<CempCategory[]> {
    const url =
      `${CEMPRE_AGREGADO_URL}/periodos/${period}/variaveis/${VARIABLES.companies}` +
      `?localidades=N1%5Ball%5D&classificacao=${CNAE_CLASSIFICATION}%5Ball%5D`;

    const payload = await this.getJson<IbgeVariable[]>(url);
    const classes = new Map<string, CempCategory>();

    for (const result of payload.flatMap((variable) => variable.resultados)) {
      for (const [categoryId, name] of Object.entries(result.classificacoes[0]?.categoria ?? {})) {
        const parsed = CLASS.exec(name);
        if (!parsed) continue;

        const [, division, subclass, label] = parsed;
        const code = `${division}${subclass}`;
        if (!division || !subclass || !label || classes.has(code)) continue;

        classes.set(code, { code, name: label.trim(), categoryId });
      }
    }

    return [...classes.values()].sort((left, right) => left.code.localeCompare(right.code));
  }

  /**
   * Reads every municipality of up to two classes.
   * @param period - Reference year.
   * @param categories - Classes and their SIDRA category ids.
   * @returns One row per municipality and class that reports something.
   */
  async fetchEmployment(period: string, categories: CempCategory[]): Promise<EmploymentRecord[]> {
    const variables = Object.values(VARIABLES).join(',');
    const categoryIds = categories.map((category) => category.categoryId).join(',');
    const url =
      `${CEMPRE_AGREGADO_URL}/periodos/${period}/variaveis/${variables}` +
      `?localidades=N6%5Ball%5D` +
      `&classificacao=${CNAE_CLASSIFICATION}%5B${categoryIds}%5D`;

    const payload = await this.getJson<IbgeVariable[]>(url);
    const rows = new Map<string, EmploymentRecord>();

    for (const variable of payload) {
      const field = FIELD_BY_VARIABLE[variable.id];
      if (!field) continue;

      for (const result of variable.resultados) {
        const cnaeCode = readClassCode(result);
        if (!cnaeCode) continue;

        for (const item of result.series) {
          const municipalityCode = item.localidade.id;
          if (!municipalityCode) continue;

          const key = `${municipalityCode}|${cnaeCode}`;
          const row = rows.get(key) ?? emptyRecord(municipalityCode, cnaeCode);
          row[field] = toNumber(item.serie[period]) ?? 0;
          rows.set(key, row);
        }
      }
    }

    // A class with no company in the municipality is not worth a row.
    return [...rows.values()].filter((row) => row.companies > 0 || row.occupiedPersons > 0);
  }

  /**
   * Reads the municipality as a whole, without the CNAE breakdown. IBGE applies
   * statistical secrecy to the class-level cells but never to this one, so it is
   * the only source of a total that matches the official figures.
   * @param period - Reference year.
   * @returns One row per municipality, in a single request.
   */
  async fetchTotals(period: string): Promise<EmploymentTotalRecord[]> {
    const variables = Object.values(VARIABLES).join(',');
    const url = `${CEMPRE_AGREGADO_URL}/periodos/${period}/variaveis/${variables}?localidades=N6%5Ball%5D`;

    const payload = await this.getJson<IbgeVariable[]>(url);
    const rows = new Map<string, EmploymentTotalRecord>();

    for (const variable of payload) {
      const field = FIELD_BY_VARIABLE[variable.id];
      if (!field) continue;

      for (const result of variable.resultados) {
        for (const item of result.series) {
          const municipalityCode = item.localidade.id;
          if (!municipalityCode) continue;

          const row = rows.get(municipalityCode) ?? emptyTotal(municipalityCode);
          row[field] = toNumber(item.serie[period]) ?? 0;
          rows.set(municipalityCode, row);
        }
      }
    }

    return [...rows.values()];
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

/** Reads the 4-digit class code out of the category name of one result. */
function readClassCode(result: IbgeResult): string | null {
  const name = Object.values(result.classificacoes[0]?.categoria ?? {})[0];
  if (!name) return null;

  const parsed = CLASS.exec(name);
  if (!parsed) return null;

  return `${parsed[1]}${parsed[2]}`;
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

function emptyTotal(municipalityCode: string): EmploymentTotalRecord {
  return {
    municipalityCode,
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

export { CLASSES_PER_REQUEST };
