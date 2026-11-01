export const DATASET_ADAPTERS = 'DATASET_ADAPTERS';

export interface DatasetAdapter {
  readonly datasetKey: string;
  /** Reference the scheduler uses when the dataset was never collected before. */
  readonly defaultReference: string;
  /**
   * Runs discover, download, validate, transform and publish for a reference.
   * Must be idempotent: publishing an already published reference is a no-op.
   */
  ingest(reference: string): Promise<void>;
}
