import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../common/database/geo/geo.connection';
import type { CoverageRepository } from '../domain/region-read.repository.interface';
import type { CoverageEntry } from '../domain/region-view.types';

@Injectable()
export class CoverageRepositoryPostgis implements CoverageRepository {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async listPublished(): Promise<CoverageEntry[]> {
    const { rows } = await sql<CoverageEntry>`
      SELECT version.dataset_key AS "datasetKey",
             version.reference AS "reference",
             version.published_at AS "publishedAt",
             version.methodology AS "methodology",
             version.source_url AS "sourceUrl",
             version.row_count::float8 AS "rowCount",
             license.license AS "license",
             COALESCE(license.redistribution_allowed, false) AS "redistributionAllowed",
             license.attribution_text AS "attributionText",
             schedule.sla_days AS "slaDays",
             COALESCE(
               version.published_at + (schedule.sla_days * interval '1 day') < now(),
               false
             ) AS "isStale"
      FROM geo.dataset_version AS version
      LEFT JOIN geo.dataset_license AS license ON license.dataset_key = version.dataset_key
      LEFT JOIN geo.ingestion_schedule AS schedule ON schedule.dataset_key = version.dataset_key
      WHERE version.status = 'published'
      ORDER BY version.dataset_key
    `.execute(this.db);

    return rows;
  }
}
