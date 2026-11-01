import { IngestionJob } from './ingestion-job.types';

export const INGESTION_JOB_REPOSITORY = 'INGESTION_JOB_REPOSITORY';

export interface IngestionJobRepository {
  /** Inserts a job, or returns the id of the active job for the same reference. */
  enqueue(datasetKey: string, reference: string): Promise<string>;
  /** Claims the next due job, or null when the queue is empty. */
  claim(workerId: string): Promise<IngestionJob | null>;
  /** Refreshes the lock timestamp of a running job. */
  heartbeat(jobId: string): Promise<void>;
  complete(jobId: string): Promise<void>;
  /** Records the failure and schedules a retry, or parks the job as failed. */
  fail(jobId: string, error: string): Promise<void>;
  /** Returns jobs held by a dead worker back to the queue. */
  reapStale(staleMinutes: number): Promise<number>;
}
