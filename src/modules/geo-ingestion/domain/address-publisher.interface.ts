import type {
  ChunkStats,
  DatasetStagingInput,
  FinalizeDatasetInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { AddressInput } from './address.types';

export const ADDRESS_PUBLISHER = 'ADDRESS_PUBLISHER';

export type AddressVersionInput = DatasetStagingInput;

export interface AddressFinalizeInput extends FinalizeDatasetInput {
  /** Below this many rows the source is incomplete and must not replace the live table. */
  minRows: number;
}

/**
 * Publishes the CNEFE address base. The dataset is written to a mirror table
 * without indexes and swapped in, because a full snapshot has ~106M rows.
 */
export interface AddressPublisher {
  begin(input: AddressVersionInput): Promise<string>;
  writeChunk(versionId: string, rows: AddressInput[]): Promise<ChunkStats>;
  finalize(input: AddressFinalizeInput): Promise<PublishDatasetResult>;
  discard(datasetKey: string, versionId: string): Promise<void>;
}
