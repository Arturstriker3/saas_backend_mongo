import type { RegionLevel } from '../../../common/database/geo/geo-db.types';
import type { CoverageEntry, RegionDetail, RegionSummary } from './region-view.types';

export const REGION_READ_REPOSITORY = 'REGION_READ_REPOSITORY';

export interface ListRegionsFilter {
  level?: RegionLevel;
  parentCode?: string;
  search?: string;
  limit: number;
}

export interface RegionReadRepository {
  list(filter: ListRegionsFilter): Promise<RegionSummary[]>;
  findByCode(ibgeCode: string, level: RegionLevel): Promise<RegionDetail | null>;
}

export const COVERAGE_REPOSITORY = 'COVERAGE_REPOSITORY';

export interface CoverageRepository {
  listPublished(): Promise<CoverageEntry[]>;
}
