import type {
  ChunkStats,
  DatasetStagingInput,
  FinalizeDatasetInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { SectorBasicsInput, SectorIncomeInput } from './sector-indicator.types';

export const SECTOR_INDICATOR_PUBLISHER = 'SECTOR_INDICATOR_PUBLISHER';

export type IndicatorVersionInput = DatasetStagingInput;

/**
 * Publishes socioeconomic attributes keyed by census tract. Shares the version
 * lifecycle with `DatasetPublisher`, but writes `geo.sector_indicator` instead of
 * region geometries.
 */
export interface SectorIndicatorPublisher {
  begin(input: IndicatorVersionInput): Promise<string>;
  /** Upserts the basic indicators, clearing income so a dropped value never survives. */
  writeBasics(versionId: string, rows: SectorBasicsInput[]): Promise<ChunkStats>;
  /** Fills income for the sectors that report it; returns how many rows matched. */
  writeIncome(versionId: string, rows: SectorIncomeInput[]): Promise<number>;
  finalize(input: FinalizeDatasetInput): Promise<PublishDatasetResult>;
  discard(datasetKey: string, versionId: string): Promise<void>;
}
