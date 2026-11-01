import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../common/database/geo/geo.connection';
import type {
  RegionReadRepository,
  ListRegionsFilter,
} from '../domain/region-read.repository.interface';
import type { RegionDetail, RegionSummary } from '../domain/region-view.types';

interface RegionSummaryRow {
  ibgeCode: string;
  level: RegionSummary['level'];
  name: string;
  parentCode: string | null;
  areaKm2: number | null;
  lat: number | null;
  lng: number | null;
}

interface RegionDetailRow extends RegionSummaryRow {
  geometry: unknown;
  childrenCount: number;
  datasetKey: string | null;
  reference: string | null;
  publishedAt: Date | null;
}

@Injectable()
export class RegionReadRepositoryPostgis implements RegionReadRepository {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async list(filter: ListRegionsFilter): Promise<RegionSummary[]> {
    const search = filter.search ?? null;
    const { rows } = await sql<RegionSummaryRow>`
      SELECT region.ibge_code AS "ibgeCode",
             region.level AS "level",
             region.name AS "name",
             parent.ibge_code AS "parentCode",
             region.area_km2::float8 AS "areaKm2",
             ST_Y(region.centroid::geometry)::float8 AS "lat",
             ST_X(region.centroid::geometry)::float8 AS "lng"
      FROM geo.region AS region
      LEFT JOIN geo.region AS parent ON parent.id = region.parent_id
      WHERE (${filter.level ?? null}::text IS NULL OR region.level = ${filter.level ?? null})
        AND (${filter.parentCode ?? null}::text IS NULL
             OR parent.ibge_code = ${filter.parentCode ?? null})
        AND (${search}::text IS NULL OR region.search_name LIKE '%' || ${search} || '%')
      ORDER BY region.level, region.name
      LIMIT ${filter.limit}
    `.execute(this.db);

    return rows.map(toSummary);
  }

  async findByCode(ibgeCode: string, level: RegionSummary['level']): Promise<RegionDetail | null> {
    const { rows } = await sql<RegionDetailRow>`
      SELECT region.ibge_code AS "ibgeCode",
             region.level AS "level",
             region.name AS "name",
             parent.ibge_code AS "parentCode",
             region.area_km2::float8 AS "areaKm2",
             ST_Y(region.centroid::geometry)::float8 AS "lat",
             ST_X(region.centroid::geometry)::float8 AS "lng",
             ST_AsGeoJSON(region.geom)::json AS "geometry",
             (SELECT count(*) FROM geo.region AS child WHERE child.parent_id = region.id)::int
               AS "childrenCount",
             version.dataset_key AS "datasetKey",
             version.reference AS "reference",
             version.published_at AS "publishedAt"
      FROM geo.region AS region
      LEFT JOIN geo.region AS parent ON parent.id = region.parent_id
      LEFT JOIN geo.dataset_version AS version ON version.id = region.dataset_version_id
      WHERE region.ibge_code = ${ibgeCode} AND region.level = ${level}
      LIMIT 1
    `.execute(this.db);

    const row = rows[0];
    if (!row) return null;

    return {
      ...toSummary(row),
      geometry: row.geometry,
      childrenCount: row.childrenCount,
      dataset: row.datasetKey
        ? { datasetKey: row.datasetKey, reference: row.reference, publishedAt: row.publishedAt }
        : null,
    };
  }
}

function toSummary(row: RegionSummaryRow): RegionSummary {
  return {
    ibgeCode: row.ibgeCode,
    level: row.level,
    name: row.name,
    parentCode: row.parentCode,
    areaKm2: row.areaKm2,
    centroid: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
  };
}
