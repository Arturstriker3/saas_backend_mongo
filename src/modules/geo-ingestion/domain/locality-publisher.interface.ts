import type {
  DatasetStagingInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { LocalityInput } from './locality.types';

export const LOCALITY_PUBLISHER = 'LOCALITY_PUBLISHER';

export interface PublishLocalityInput extends DatasetStagingInput {
  checksum: string;
  localities: LocalityInput[];
}

/**
 * Publishes the official code registry. The registry is small enough to be
 * replaced in one transaction, so there is no staging table and no swap.
 */
export interface LocalityPublisher {
  publish(input: PublishLocalityInput): Promise<PublishDatasetResult>;
}
