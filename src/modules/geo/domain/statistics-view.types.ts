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
