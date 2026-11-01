import type {
  ChunkStats,
  DatasetStagingInput,
  FinalizeDatasetInput,
  PublishDatasetResult,
} from './dataset-publisher.interface';
import type { CnaeInput, CompanyInput, EstablishmentInput } from './establishment.types';

export const ESTABLISHMENT_PUBLISHER = 'ESTABLISHMENT_PUBLISHER';

export type EstablishmentVersionInput = DatasetStagingInput;

export interface EstablishmentFinalizeInput extends FinalizeDatasetInput {
  /** CNAE descriptions published with the same version. */
  cnaeStats: ChunkStats;
  /** Companies (legal names) published with the same version. */
  companyStats: ChunkStats;
}

/**
 * Publishes the CNPJ registry. Shares the version lifecycle with
 * `DatasetPublisher`, but writes `geo.establishment`, `geo.company` and `geo.cnae`.
 */
export interface EstablishmentPublisher {
  begin(input: EstablishmentVersionInput): Promise<string>;
  writeCnaes(versionId: string, rows: CnaeInput[]): Promise<ChunkStats>;
  writeCompanies(versionId: string, rows: CompanyInput[]): Promise<ChunkStats>;
  writeEstablishments(versionId: string, rows: EstablishmentInput[]): Promise<ChunkStats>;
  finalize(input: EstablishmentFinalizeInput): Promise<PublishDatasetResult>;
  discard(datasetKey: string, versionId: string): Promise<void>;
}
