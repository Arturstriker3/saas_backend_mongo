import { ColumnType, Generated } from 'kysely';

export type DatasetVersionStatus = 'staging' | 'published' | 'superseded' | 'failed';
export type IngestionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type RegionLevel = 'state' | 'municipality' | 'district' | 'neighborhood' | 'sector';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface DatasetLicenseTable {
  dataset_key: string;
  license: string;
  redistribution_allowed: Generated<boolean>;
  attribution_required: Generated<boolean>;
  attribution_text: string | null;
}

export interface DatasetVersionTable {
  id: Generated<string>;
  dataset_key: string;
  reference: string;
  status: Generated<DatasetVersionStatus>;
  extracted_at: ColumnType<Date, Date | string, Date | string>;
  published_at: NullableTimestamp;
  methodology: string;
  source_url: string;
  checksum: string;
  row_count: ColumnType<string, string | number, string | number>;
  created_at: Timestamp;
}

export interface IngestionJobTable {
  id: Generated<string>;
  dataset_key: string;
  reference: string;
  status: Generated<IngestionJobStatus>;
  priority: Generated<number>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  run_after: Timestamp;
  locked_by: string | null;
  locked_at: NullableTimestamp;
  started_at: NullableTimestamp;
  finished_at: NullableTimestamp;
  error: string | null;
  correlation_id: Generated<string>;
  created_at: Timestamp;
}

export interface IngestionScheduleTable {
  dataset_key: string;
  enabled: Generated<boolean>;
  cadence_days: number;
  sla_days: number;
  last_reference: string | null;
  last_checked_at: NullableTimestamp;
  created_at: Timestamp;
}

export interface DatasetChangeTable {
  id: Generated<string>;
  dataset_version_id: string;
  previous_version_id: string | null;
  entity_type: string;
  change_type: 'added' | 'removed' | 'changed';
  entity_count: ColumnType<string, string | number, string | number>;
  created_at: Timestamp;
}

export interface RegionTable {
  id: Generated<string>;
  level: RegionLevel;
  ibge_code: string;
  parent_id: string | null;
  name: string;
  search_name: string;
  geom: ColumnType<unknown, string | null, string | null>;
  area_km2: ColumnType<string | null, string | number | null, string | number | null>;
  centroid: ColumnType<unknown, string | null, string | null>;
  dataset_version_id: string | null;
  updated_at: Timestamp;
}

export interface SectorIndicatorTable {
  sector_code: string;
  dataset_version_id: string | null;
  population: number | null;
  households: number | null;
  occupied_households: number | null;
  average_household_size: ColumnType<string | null, string | number | null, string | number | null>;
  responsible_persons: number | null;
  average_income: ColumnType<string | null, string | number | null, string | number | null>;
  median_income: ColumnType<string | null, string | number | null, string | number | null>;
  urban: boolean | null;
  updated_at: Timestamp;
}

export interface CnaeTable {
  code: string;
  description: string;
  dataset_version_id: string | null;
  updated_at: Timestamp;
}

export interface EstablishmentTable {
  cnpj: string;
  cnpj_basico: string;
  trade_name: string | null;
  is_headquarters: boolean;
  cnae_principal: string | null;
  registration_status: number | null;
  opened_on: ColumnType<string | null, string | null, string | null>;
  cep: string | null;
  uf: string | null;
  municipality_code: string | null;
  dataset_version_id: string | null;
  updated_at: Timestamp;
}

export interface GeoDB {
  'geo.dataset_license': DatasetLicenseTable;
  'geo.dataset_version': DatasetVersionTable;
  'geo.dataset_change': DatasetChangeTable;
  'geo.ingestion_job': IngestionJobTable;
  'geo.ingestion_schedule': IngestionScheduleTable;
  'geo.region': RegionTable;
  'geo.sector_indicator': SectorIndicatorTable;
  'geo.cnae': CnaeTable;
  'geo.establishment': EstablishmentTable;
}
