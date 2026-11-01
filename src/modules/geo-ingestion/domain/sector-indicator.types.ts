/** Basic Censo 2022 aggregates for one census tract. */
export interface SectorBasicsInput {
  sectorCode: string;
  population: number | null;
  households: number | null;
  occupiedHouseholds: number | null;
  averageHouseholdSize: number | null;
  urban: boolean | null;
}

/** Income of the household head, available only for sectors that report it. */
export interface SectorIncomeInput {
  sectorCode: string;
  responsiblePersons: number | null;
  averageIncome: number | null;
  medianIncome: number | null;
}
