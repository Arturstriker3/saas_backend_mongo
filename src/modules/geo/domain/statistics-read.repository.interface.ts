import type {
  MunicipalityEmployment,
  MunicipalityStatistics,
  UfStatistics,
} from './statistics-view.types';

export const STATISTICS_READ_REPOSITORY = 'STATISTICS_READ_REPOSITORY';

export interface StatisticsReadRepository {
  /** @returns null when the code is not a municipality of the IBGE registry. */
  municipality(code: string, limit: number): Promise<MunicipalityStatistics | null>;
  /** @param uf - IBGE code or two-letter abbreviation. @returns null when unknown. */
  uf(uf: string, limit: number): Promise<UfStatistics | null>;
  /** Formal employment (CEMPRE) of one municipality by CNAE division. */
  employment(code: string, limit: number): Promise<MunicipalityEmployment | null>;
}
