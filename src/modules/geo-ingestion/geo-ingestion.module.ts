import { Module } from '@nestjs/common';
import { GeoDatabaseModule } from '../../common/database/geo/geo.module';
import { WorkerMetricsRegistryModule } from '../../common/metrics/worker-metrics.registry';
import { GeoIngestionRunner } from './application/geo-ingestion.runner';
import { IngestionScheduler } from './application/ingestion-scheduler';
import { DATASET_ADAPTERS, type DatasetAdapter } from './domain/dataset-adapter.interface';
import { DATASET_PUBLISHER } from './domain/dataset-publisher.interface';
import { ESTABLISHMENT_PUBLISHER } from './domain/establishment-publisher.interface';
import { INGESTION_JOB_REPOSITORY } from './domain/ingestion-job.repository.interface';
import { INGESTION_SCHEDULE_REPOSITORY } from './domain/ingestion-schedule.repository.interface';
import { SECTOR_INDICATOR_PUBLISHER } from './domain/sector-indicator-publisher.interface';
import { IbgeCensoAdapter } from './infrastructure/adapters/ibge-censo.adapter';
import { IbgeMalhaAdapter } from './infrastructure/adapters/ibge-malha.adapter';
import { RfbCnpjAdapter } from './infrastructure/adapters/rfb-cnpj.adapter';
import {
  IbgeBairroAdapter,
  IbgeSetorAdapter,
} from './infrastructure/adapters/shapefile-region.adapter';
import { IbgeCensoClient } from './infrastructure/ibge/ibge-censo.client';
import { IbgeMalhaClient } from './infrastructure/ibge/ibge-malha.client';
import { IngestionJobRepositoryPostgis } from './infrastructure/ingestion-job.repository.postgis';
import { IngestionScheduleRepositoryPostgis } from './infrastructure/ingestion-schedule.repository.postgis';
import { GeoIngestionMetrics } from './infrastructure/metrics/geo-ingestion.metrics';
import { DatasetPublisherPostgis } from './infrastructure/publisher/dataset-publisher.postgis';
import { EstablishmentPublisherPostgis } from './infrastructure/publisher/establishment.publisher.postgis';
import { SectorIndicatorPublisherPostgis } from './infrastructure/publisher/sector-indicator.publisher.postgis';
import { RfbCnpjClient } from './infrastructure/rfb/rfb-cnpj.client';
import { GeoShapefileSource } from './infrastructure/shapefile/geo-shapefile.source';

@Module({
  imports: [GeoDatabaseModule, WorkerMetricsRegistryModule],
  providers: [
    IngestionJobRepositoryPostgis,
    { provide: INGESTION_JOB_REPOSITORY, useExisting: IngestionJobRepositoryPostgis },
    IngestionScheduleRepositoryPostgis,
    { provide: INGESTION_SCHEDULE_REPOSITORY, useExisting: IngestionScheduleRepositoryPostgis },
    DatasetPublisherPostgis,
    { provide: DATASET_PUBLISHER, useExisting: DatasetPublisherPostgis },
    SectorIndicatorPublisherPostgis,
    { provide: SECTOR_INDICATOR_PUBLISHER, useExisting: SectorIndicatorPublisherPostgis },
    EstablishmentPublisherPostgis,
    { provide: ESTABLISHMENT_PUBLISHER, useExisting: EstablishmentPublisherPostgis },
    IbgeMalhaClient,
    IbgeCensoClient,
    RfbCnpjClient,
    GeoShapefileSource,
    IbgeMalhaAdapter,
    IbgeBairroAdapter,
    IbgeSetorAdapter,
    IbgeCensoAdapter,
    RfbCnpjAdapter,
    {
      provide: DATASET_ADAPTERS,
      useFactory: (
        malha: IbgeMalhaAdapter,
        bairro: IbgeBairroAdapter,
        setor: IbgeSetorAdapter,
        censo: IbgeCensoAdapter,
        cnpj: RfbCnpjAdapter,
      ): DatasetAdapter[] => [malha, bairro, setor, censo, cnpj],
      inject: [
        IbgeMalhaAdapter,
        IbgeBairroAdapter,
        IbgeSetorAdapter,
        IbgeCensoAdapter,
        RfbCnpjAdapter,
      ],
    },
    GeoIngestionMetrics,
    GeoIngestionRunner,
    IngestionScheduler,
  ],
})
export class GeoIngestionModule {}
