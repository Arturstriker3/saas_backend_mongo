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
  indicatorDatasetKey: string | null;
  indicatorReference: string | null;
  indicatorPublishedAt: Date | null;
  population: number | null;
  households: number | null;
  occupiedHouseholds: number | null;
  averageHouseholdSize: number | null;
  averageIncome: number | null;
  medianIncome: number | null;
  urban: boolean | null;
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
             version.published_at AS "publishedAt",
             indicator_version.dataset_key AS "indicatorDatasetKey",
             indicator_version.reference AS "indicatorReference",
             indicator_version.published_at AS "indicatorPublishedAt",
             indicator.population AS "population",
             indicator.households AS "households",
             indicator.occupied_households AS "occupiedHouseholds",
             indicator.average_household_size::float8 AS "averageHouseholdSize",
             indicator.average_income::float8 AS "averageIncome",
             indicator.median_income::float8 AS "medianIncome",
             indicator.urban AS "urban"
      FROM geo.region AS region
      LEFT JOIN geo.region AS parent ON parent.id = region.parent_id
      LEFT JOIN geo.dataset_version AS version ON version.id = region.dataset_version_id
      LEFT JOIN geo.sector_indicator AS indicator
        ON indicator.sector_code = region.ibge_code
       AND region.level = 'sector'
      LEFT JOIN geo.dataset_version AS indicator_version
        ON indicator_version.id = indicator.dataset_version_id
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
      indicators:
        row.indicatorDatasetKey === null
          ? null
          : {
              population: row.population,
              households: row.households,
              occupiedHouseholds: row.occupiedHouseholds,
              averageHouseholdSize: row.averageHouseholdSize,
              averageIncome: row.averageIncome,
              medianIncome: row.medianIncome,
              urban: row.urban,
              dataset: {
                datasetKey: row.indicatorDatasetKey,
                reference: row.indicatorReference,
                publishedAt: row.indicatorPublishedAt,
              },
            },
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
