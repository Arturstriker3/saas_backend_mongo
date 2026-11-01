export const INGESTION_SCHEDULE_REPOSITORY = 'INGESTION_SCHEDULE_REPOSITORY';

/** A dataset whose cadence window has elapsed and must be collected again. */
export interface DueSchedule {
  datasetKey: string;
  /** Reference of the last collection, or null when the dataset never ran. */
  lastReference: string | null;
}

export interface IngestionScheduleRepository {
  /** Returns the enabled datasets that are due, oldest check first. */
  findDue(): Promise<DueSchedule[]>;
  /** Records that a collection was queued, starting a new cadence window. */
  markQueued(datasetKey: string, reference: string): Promise<void>;
}
