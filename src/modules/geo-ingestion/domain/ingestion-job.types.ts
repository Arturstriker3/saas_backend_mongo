export interface IngestionJob {
  id: string;
  datasetKey: string;
  reference: string;
  attempts: number;
  maxAttempts: number;
}
