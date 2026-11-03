import type {
  CompanyProfile,
  EstablishmentDetail,
  EstablishmentPage,
  EstablishmentSummary,
} from './establishment-view.types';

export const ESTABLISHMENT_READ_REPOSITORY = 'ESTABLISHMENT_READ_REPOSITORY';

/** Position of the last row read, ordered by CNAE then CNPJ. */
export interface EstablishmentCursor {
  cnae: string;
  cnpj: string;
}

export interface ListEstablishmentsFilter {
  municipalityCode: string;
  /**
   * Closed interval of 7-digit CNAE codes. A prefix has to be turned into a
   * range: `LIKE '5611%'` has no lower bound and the index would be read from
   * the first CNAE of the municipality instead of seeking to 5611.
   */
  cnaeRange?: { from: string; to: string };
  cursor?: EstablishmentCursor;
  limit: number;
}

export interface SearchEstablishmentsFilter {
  /** Already normalized: lowercase, without accents. */
  term: string;
  municipalityCode?: string;
  limit: number;
}

export interface EstablishmentReadRepository {
  findByCnpj(cnpj: string): Promise<EstablishmentDetail | null>;
  findCompany(cnpjBasico: string, limit: number, offset: number): Promise<CompanyProfile | null>;
  list(filter: ListEstablishmentsFilter): Promise<EstablishmentPage>;
  search(filter: SearchEstablishmentsFilter): Promise<EstablishmentSummary[]>;
}
