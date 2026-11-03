import { Injectable } from '@nestjs/common';

const IBGE_AGREGADO_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados/6579';
const POPULATION_VARIABLE = '9324';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

interface IbgePeriod {
  id: string;
  literals: string[];
}

interface IbgeSeries {
  localidade: { id: string; nome: string };
  serie: Record<string, string>;
}

interface IbgeResult {
  classificacoes: unknown[];
  series: IbgeSeries[];
}

interface IbgeVariable {
  id: string;
  variavel: string;
  unidade: string;
  resultados: IbgeResult[];
}

export interface MunicipalityEstimate {
  municipalityCode: string;
  population: number;
}

/**
 * Reads the municipal population estimates from the IBGE aggregates API
 * (SIDRA aggregate 6579, variable 9324).
 */
@Injectable()
export class IbgeEstimativasClient {
  /** Latest period the aggregate publishes, e.g. `2026`. */
  async findLatestPeriod(): Promise<string> {
    const periods = await this.getJson<IbgePeriod[]>(`${IBGE_AGREGADO_URL}/periodos`);
    const latest = periods.at(-1)?.id;

    if (!latest) throw new Error('IBGE returned no population estimate period');

    return latest;
  }

  /** @param period - Estimate year, as returned by `findLatestPeriod`. */
  async fetchPopulation(period: string): Promise<MunicipalityEstimate[]> {
    const url =
      `${IBGE_AGREGADO_URL}/periodos/${period}/variaveis/${POPULATION_VARIABLE}` +
      '?localidades=N6%5Ball%5D';

    const payload = await this.getJson<IbgeVariable[]>(url);

    return payload
      .flatMap((variable) => variable.resultados)
      .flatMap((result) => result.series)
      .map((series) => ({
        municipalityCode: series.localidade.id,
        population: toNumber(series.serie[period]),
      }))
      .filter((row): row is MunicipalityEstimate => row.population !== null);
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
