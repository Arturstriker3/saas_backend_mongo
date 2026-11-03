import type { LocalityTable } from '../../../../common/database/geo/geo-db.types';

/** One row of the official IBGE code registry. */
export interface LocalityInput {
  level: LocalityTable['level'];
  ibgeCode: string;
  name: string;
  searchName: string;
  /** IBGE code of the state; for a state, its own code. */
  ufCode: string;
  /** Two-letter state abbreviation. */
  ufSigla: string;
}
