/** One line of a "top activities" ranking. */
export interface CnaeRankEntry {
  code: string;
  description: string | null;
  establishments: number;
  /** Fraction of the active establishments in the scope. */
  share: number;
}

export interface MunicipalityStatistics {
  municipality: {
    code: string;
    name: string | null;
    uf: string | null;
    population: number | null;
  };
  activeEstablishments: number;
  cnaeCount: number;
  topCnaes: CnaeRankEntry[];
}

export interface UfStatistics {
  uf: {
    code: string;
    sigla: string | null;
    name: string | null;
  };
  activeEstablishments: number;
  cnaeCount: number;
  topCnaes: CnaeRankEntry[];
}

/** One CNAE division of the IBGE economic registry (CEMPRE). */
export interface CnaeDivisionEmployment {
  code: string;
  name: string;
  companies: number;
  occupiedPersons: number;
  salariedPersons: number;
  salariesThousandBrl: number;
  /** Fraction of the occupied persons of the municipality. */
  share: number;
}

export interface EmploymentTotals {
  companies: number;
  occupiedPersons: number;
  salariedPersons: number;
  salariesThousandBrl: number;
  /** Salaries divided by the salaried persons and by twelve months, in reais. */
  averageMonthlySalary: number | null;
}

export interface MunicipalityEmployment {
  municipality: {
    code: string;
    name: string | null;
    uf: string | null;
  };
  /** Year the figures refer to; null when the municipality has no record. */
  reference: string | null;
  totals: EmploymentTotals;
  divisions: CnaeDivisionEmployment[];
}
