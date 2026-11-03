/** One CNAE division of the IBGE economic registry. */
export interface CnaeDivisionInput {
  code: string;
  name: string;
}

/** Formal employment of one municipality in one CNAE division. */
export interface EmploymentRecord {
  municipalityCode: string;
  cnaeCode: string;
  companies: number;
  occupiedPersons: number;
  salariedPersons: number;
  salariesThousandBrl: number;
}
