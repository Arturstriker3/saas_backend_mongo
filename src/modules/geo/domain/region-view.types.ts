import type { RegionLevel } from '../../../common/database/geo/geo-db.types';

export interface RegionSummary {
  ibgeCode: string;
  level: RegionLevel;
  name: string;
  parentCode: string | null;
  areaKm2: number | null;
  centroid: { lat: number; lng: number } | null;
}

export interface RegionDatasetEvidence {
  datasetKey: string;
  reference: string | null;
  publishedAt: Date | null;
}

/** Censo 2022 attributes attached to a census tract. */
export interface SectorIndicatorsView {
  population: number | null;
  households: number | null;
  occupiedHouseholds: number | null;
  averageHouseholdSize: number | null;
  averageIncome: number | null;
  medianIncome: number | null;
  urban: boolean | null;
  dataset: RegionDatasetEvidence;
}

export interface RegionDetail extends RegionSummary {
  childrenCount: number;
  geometry: unknown;
  dataset: RegionDatasetEvidence | null;
  /** Present only for census tracts that have socioeconomic data. */
  indicators: SectorIndicatorsView | null;
}

export interface CoverageEntry {
  datasetKey: string;
  reference: string;
  publishedAt: Date | null;
  methodology: string;
  sourceUrl: string;
  rowCount: number;
  license: string | null;
  redistributionAllowed: boolean;
  attributionText: string | null;
  slaDays: number | null;
  isStale: boolean;
}
