import type { RegionLevel } from '../../../common/database/geo/geo-db.types';

export interface RegionInput {
  level: RegionLevel;
  ibgeCode: string;
  parentCode: string | null;
  name: string;
  searchName: string;
  /** GeoJSON MultiPolygon as a JSON string. */
  geometry: string;
}
