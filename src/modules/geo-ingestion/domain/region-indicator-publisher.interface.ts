import type {
  DatasetStagingInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { RegionIndicatorInput } from './region-indicator.types';

export const REGION_INDICATOR_PUBLISHER = 'REGION_INDICATOR_PUBLISHER';

export interface PublishRegionIndicatorInput extends DatasetStagingInput {
  checksum: string;
  indicatorKey: string;
  reference: string;
  indicators: RegionIndicatorInput[];
}

/**
 * Publishes numeric attributes keyed by region. Rows are upserted per
 * `(region_code, indicator_key, reference)`, so several vintages coexist.
 */
export interface RegionIndicatorPublisher {
  publish(input: PublishRegionIndicatorInput): Promise<PublishDatasetResult>;
}
