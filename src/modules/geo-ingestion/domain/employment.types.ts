/** One CNAE class (4 digits) of the IBGE economic registry. */
export interface CnaeCategoryInput {
  code: string;
  name: string;
}

/** Formal employment of one municipality in one CNAE class. */
export interface EmploymentRecord {
  municipalityCode: string;
  cnaeCode: string;
  companies: number;
  occupiedPersons: number;
  salariedPersons: number;
  salariesThousandBrl: number;
}

/**
 * The municipality as a whole, without the CNAE breakdown.
 *
 * IBGE withholds the employment of a class in a municipality where too few
 * companies report it, so summing the classes loses a quarter of the jobs of a
 * small town. The total comes from the same aggregate read without the
 * classification, which is never withheld.
 */
export interface EmploymentTotalRecord {
  municipalityCode: string;
  companies: number;
  occupiedPersons: number;
  salariedPersons: number;
  salariesThousandBrl: number;
}
