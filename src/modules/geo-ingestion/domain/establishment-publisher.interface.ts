import type {
  ChunkStats,
  DatasetStagingInput,
  FinalizeDatasetInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { CnaeInput, EstablishmentInput } from './establishment.types';

export const ESTABLISHMENT_PUBLISHER = 'ESTABLISHMENT_PUBLISHER';

export type EstablishmentVersionInput = DatasetStagingInput;

export interface EstablishmentFinalizeInput extends FinalizeDatasetInput {
  /** CNAE descriptions published with the same version. */
  cnaeStats: ChunkStats;
}

/**
 * Publishes the CNPJ registry. Shares the version lifecycle with
 * `DatasetPublisher`, but writes `geo.establishment` and `geo.cnae`.
 */
export interface EstablishmentPublisher {
  begin(input: EstablishmentVersionInput): Promise<string>;
  writeCnaes(versionId: string, rows: CnaeInput[]): Promise<ChunkStats>;
  writeEstablishments(versionId: string, rows: EstablishmentInput[]): Promise<ChunkStats>;
  finalize(input: EstablishmentFinalizeInput): Promise<PublishDatasetResult>;
  discard(datasetKey: string, versionId: string): Promise<void>;
}
