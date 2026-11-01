import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../common/database/geo/geo.connection';
import type {
  DueSchedule,
  IngestionScheduleRepository,
} from '../domain/ingestion-schedule.repository.interface';

interface DueScheduleRow {
  dataset_key: string;
  last_reference: string | null;
}

@Injectable()
export class IngestionScheduleRepositoryPostgis implements IngestionScheduleRepository {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async findDue(): Promise<DueSchedule[]> {
    const { rows } = await sql<DueScheduleRow>`
      SELECT dataset_key, last_reference
      FROM geo.ingestion_schedule
      WHERE enabled
        AND (
          last_checked_at IS NULL
          OR last_checked_at + (cadence_days * interval '1 day') <= now()
        )
      ORDER BY last_checked_at NULLS FIRST, dataset_key
    `.execute(this.db);

    return rows.map((row) => ({
      datasetKey: row.dataset_key,
      lastReference: row.last_reference,
    }));
  }

  async markQueued(datasetKey: string, reference: string): Promise<void> {
    await this.db
      .updateTable('geo.ingestion_schedule')
      .set({ last_checked_at: sql<Date>`now()`, last_reference: reference })
      .where('dataset_key', '=', datasetKey)
      .execute();
  }
}
