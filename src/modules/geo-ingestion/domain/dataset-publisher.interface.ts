import type { RegionInput } from './region.types';

export const DATASET_PUBLISHER = 'DATASET_PUBLISHER';

export interface DatasetStagingInput {
  datasetKey: string;
  reference: string;
  methodology: string;
  sourceUrl: string;
  extractedAt: Date;
}

export interface DatasetVersionInput extends DatasetStagingInput {
  /** SRID of the incoming geometry; rows are transformed to 4326 on write. */
  sourceSrid: number;
}

export interface PublishDatasetInput extends DatasetVersionInput {
  checksum: string;
  regions: RegionInput[];
}

export interface FinalizeDatasetInput {
  datasetKey: string;
  versionId: string;
  /** Checksum of the raw source, only known after the source is fully read. */
  checksum: string;
  stats: ChunkStats;
}

export interface ChunkStats {
  inserted: number;
  updated: number;
}

export interface PublishDatasetResult {
  versionId: string;
  inserted: number;
  updated: number;
}

export interface DatasetPublisher {
  /**
   * Convenience path for small datasets: opens the version, writes every region
   * and publishes at the end. Discards the version on failure.
   */
  publish(input: PublishDatasetInput): Promise<PublishDatasetResult>;

  /** Opens a staging version, invisible to readers until finalized. */
  begin(input: DatasetVersionInput): Promise<string>;

  /** Writes one batch of regions. Each batch commits on its own. */
  writeChunk(versionId: string, regions: RegionInput[], sourceSrid: number): Promise<ChunkStats>;

  /** Validates the written rows and flips the version to published. */
  finalize(input: FinalizeDatasetInput): Promise<PublishDatasetResult>;

  /** Removes a failed staging version without losing the previous one. */
  discard(datasetKey: string, versionId: string): Promise<void>;
}
