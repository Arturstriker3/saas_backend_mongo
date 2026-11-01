export const DATASET_ADAPTERS = 'DATASET_ADAPTERS';

export interface DatasetAdapter {
  readonly datasetKey: string;
  /** Reference the scheduler uses when the dataset was never collected before. */
  readonly defaultReference: string;
  /**
   * Resolves the reference currently published at the source. Datasets whose
   * revision changes without a fixed vintage (e.g. a dated file) implement it.
   */
  discoverReference?(): Promise<string>;
  /**
   * Runs discover, download, validate, transform and publish for a reference.
   * Must be idempotent: publishing an already published reference is a no-op.
   */
  ingest(reference: string): Promise<void>;
}
