import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Prepares the schedule to be consumed by the worker.
 *
 * The active-job index drops `succeeded` so a dataset can be collected again for
 * the same reference on the next cadence window; the schedule is backfilled from
 * the published versions so the first worker boot does not re-collect everything.
 */
export const migration004ScheduleRunner = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP INDEX IF EXISTS geo.ingestion_job_active_unique`.execute(db);

    await sql`
      CREATE UNIQUE INDEX ingestion_job_active_unique
        ON geo.ingestion_job (dataset_key, reference)
        WHERE status IN ('queued', 'running')
    `.execute(db);

    await sql`
      UPDATE geo.ingestion_schedule AS schedule
      SET last_checked_at = now(),
          last_reference = published.reference
      FROM (
        SELECT DISTINCT ON (dataset_key) dataset_key, reference
        FROM geo.dataset_version
        WHERE status = 'published'
        ORDER BY dataset_key, published_at DESC NULLS LAST
      ) AS published
      WHERE published.dataset_key = schedule.dataset_key
        AND schedule.last_checked_at IS NULL
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP INDEX IF EXISTS geo.ingestion_job_active_unique`.execute(db);

    await sql`
      CREATE UNIQUE INDEX ingestion_job_active_unique
        ON geo.ingestion_job (dataset_key, reference)
        WHERE status IN ('queued', 'running', 'succeeded')
    `.execute(db);
  },
};
