import type {
  ChunkStats,
  DatasetStagingInput,
  FinalizeDatasetInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { CnaeDivisionInput, EmploymentRecord } from './employment.types';

export const EMPLOYMENT_PUBLISHER = 'EMPLOYMENT_PUBLISHER';

export interface EmploymentVersionInput extends DatasetStagingInput {
  /** Written first: the fact table references the division. */
  divisions: CnaeDivisionInput[];
}

export interface EmploymentFinalizeInput extends FinalizeDatasetInput {
  reference: string;
  /** Below this many rows the extraction is incomplete and must not publish. */
  minRows: number;
}

/**
 * Publishes formal employment by municipality and CNAE division. Rows are
 * upserted per `(municipality_code, cnae_code, reference)`, so the yearly series
 * accumulates instead of replacing the previous vintage.
 */
export interface EmploymentPublisher {
  begin(input: EmploymentVersionInput): Promise<string>;
  writeChunk(versionId: string, rows: EmploymentRecord[]): Promise<ChunkStats>;
  finalize(input: EmploymentFinalizeInput): Promise<PublishDatasetResult>;
  discard(datasetKey: string, versionId: string): Promise<void>;
}
