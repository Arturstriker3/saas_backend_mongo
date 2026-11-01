import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../common/database/geo/geo.connection';
import type { IngestionJobRepository } from '../domain/ingestion-job.repository.interface';
import type { IngestionJob } from '../domain/ingestion-job.types';

interface ClaimedJobRow {
  id: string;
  dataset_key: string;
  reference: string;
  attempts: number;
  max_attempts: number;
}

@Injectable()
export class IngestionJobRepositoryPostgis implements IngestionJobRepository {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async enqueue(datasetKey: string, reference: string): Promise<string> {
    const inserted = await this.db
      .insertInto('geo.ingestion_job')
      .values({ dataset_key: datasetKey, reference })
      .onConflict((conflict) => conflict.doNothing())
      .returning('id')
      .executeTakeFirst();

    if (inserted) return inserted.id;

    const active = await this.db
      .selectFrom('geo.ingestion_job')
      .select('id')
      .where('dataset_key', '=', datasetKey)
      .where('reference', '=', reference)
      .where('status', 'in', ['queued', 'running'])
      .executeTakeFirstOrThrow();

    return active.id;
  }

  async claim(workerId: string): Promise<IngestionJob | null> {
    const { rows } = await sql<ClaimedJobRow>`
      UPDATE geo.ingestion_job AS job
      SET status = 'running',
          locked_by = ${workerId},
          locked_at = now(),
          started_at = now()
      WHERE job.id = (
        SELECT pending.id
        FROM geo.ingestion_job AS pending
        WHERE pending.status = 'queued'
          AND pending.run_after <= now()
        ORDER BY pending.priority, pending.run_after
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING job.id, job.dataset_key, job.reference, job.attempts, job.max_attempts
    `.execute(this.db);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      datasetKey: row.dataset_key,
      reference: row.reference,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    };
  }

  async heartbeat(jobId: string): Promise<void> {
    await this.db
      .updateTable('geo.ingestion_job')
      .set({ locked_at: sql<Date>`now()` })
      .where('id', '=', jobId)
      .where('status', '=', 'running')
      .execute();
  }

  async complete(jobId: string): Promise<void> {
    await this.db
      .updateTable('geo.ingestion_job')
      .set({
        status: 'succeeded',
        finished_at: sql<Date>`now()`,
        locked_by: null,
        locked_at: null,
        error: null,
      })
      .where('id', '=', jobId)
      .execute();
  }

  async fail(jobId: string, error: string): Promise<void> {
    await sql`
      UPDATE geo.ingestion_job
      SET attempts = attempts + 1,
          status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'queued' END,
          finished_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
          run_after = now() + least(interval '1 minute' * power(2, attempts), interval '6 hours'),
          locked_by = NULL,
          locked_at = NULL,
          error = ${error}
      WHERE id = ${jobId}
    `.execute(this.db);
  }

  async reapStale(staleMinutes: number): Promise<number> {
    const { rows } = await sql<{ id: string }>`
      UPDATE geo.ingestion_job
      SET attempts = attempts + 1,
          status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'queued' END,
          finished_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
          locked_by = NULL,
          locked_at = NULL,
          error = 'Worker heartbeat lost'
      WHERE status = 'running'
        AND locked_at < now() - (${staleMinutes}::int * interval '1 minute')
      RETURNING id
    `.execute(this.db);

    return rows.length;
  }
}
