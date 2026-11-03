import type {
  ChunkStats,
  DatasetStagingInput,
  FinalizeDatasetInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { SimplesInput } from './establishment.types';

export const SIMPLES_PUBLISHER = 'SIMPLES_PUBLISHER';

export interface SimplesFinalizeInput extends FinalizeDatasetInput {
  /** Below this many rows the extraction is incomplete and must not publish. */
  minRows: number;
}

/**
 * Publishes the Simples Nacional and MEI option of each company by loading a
 * mirror table and swapping it in: the source is a monthly snapshot of the whole
 * registry, so merging row by row would be slower and would bloat the table.
 */
export interface SimplesPublisher {
  begin(input: DatasetStagingInput): Promise<string>;
  writeChunk(versionId: string, rows: SimplesInput[]): Promise<ChunkStats>;
  finalize(input: SimplesFinalizeInput): Promise<PublishDatasetResult>;
  discard(datasetKey: string, versionId: string): Promise<void>;
}
