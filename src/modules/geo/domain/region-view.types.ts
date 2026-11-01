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

export interface RegionDetail extends RegionSummary {
  childrenCount: number;
  geometry: unknown;
  dataset: RegionDatasetEvidence | null;
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
