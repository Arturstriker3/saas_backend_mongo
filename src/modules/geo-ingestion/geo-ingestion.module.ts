import { Module } from '@nestjs/common';
import { GeoDatabaseModule } from '../../common/database/geo/geo.module';
import { WorkerMetricsRegistryModule } from '../../common/metrics/worker-metrics.registry';
import { GeoIngestionRunner } from './application/geo-ingestion.runner';
import { IngestionScheduler } from './application/ingestion-scheduler';
import { DATASET_ADAPTERS, type DatasetAdapter } from './domain/dataset-adapter.interface';
import { DATASET_PUBLISHER } from './domain/dataset-publisher.interface';
import { ADDRESS_PUBLISHER } from './domain/address-publisher.interface';
import { ESTABLISHMENT_PUBLISHER } from './domain/establishment-publisher.interface';
import { INGESTION_JOB_REPOSITORY } from './domain/ingestion-job.repository.interface';
import { INGESTION_SCHEDULE_REPOSITORY } from './domain/ingestion-schedule.repository.interface';
import { LOCALITY_PUBLISHER } from './domain/locality-publisher.interface';
import { REGION_INDICATOR_PUBLISHER } from './domain/region-indicator-publisher.interface';
import { SECTOR_INDICATOR_PUBLISHER } from './domain/sector-indicator-publisher.interface';
import { IbgeCensoAdapter } from './infrastructure/adapters/ibge-censo.adapter';
import { CnefeAdapter } from './infrastructure/adapters/cnefe.adapter';
import { IbgeEstimativasAdapter } from './infrastructure/adapters/ibge-estimativas.adapter';
import { IbgeLocalidadesAdapter } from './infrastructure/adapters/ibge-localidades.adapter';
import { IbgeMalhaAdapter } from './infrastructure/adapters/ibge-malha.adapter';
import { RfbCnpjAdapter } from './infrastructure/adapters/rfb-cnpj.adapter';
import {
  IbgeBairroAdapter,
  IbgeSetorAdapter,
} from './infrastructure/adapters/shapefile-region.adapter';
import { IbgeCensoClient } from './infrastructure/ibge/ibge-censo.client';
import { CnefeClient } from './infrastructure/cnefe/cnefe.client';
import { IbgeEstimativasClient } from './infrastructure/ibge/ibge-estimativas.client';
import { IbgeMalhaClient } from './infrastructure/ibge/ibge-malha.client';
import { IngestionJobRepositoryPostgis } from './infrastructure/ingestion-job.repository.postgis';
import { IngestionScheduleRepositoryPostgis } from './infrastructure/ingestion-schedule.repository.postgis';
import { GeoIngestionMetrics } from './infrastructure/metrics/geo-ingestion.metrics';
import { DatasetPublisherPostgis } from './infrastructure/publisher/dataset-publisher.postgis';
import { AddressPublisherPostgis } from './infrastructure/publisher/address.publisher.postgis';
import { EstablishmentPublisherPostgis } from './infrastructure/publisher/establishment.publisher.postgis';
import { LocalityPublisherPostgis } from './infrastructure/publisher/locality.publisher.postgis';
import { RegionIndicatorPublisherPostgis } from './infrastructure/publisher/region-indicator.publisher.postgis';
import { SectorIndicatorPublisherPostgis } from './infrastructure/publisher/sector-indicator.publisher.postgis';
import { RfbCnpjClient } from './infrastructure/rfb/rfb-cnpj.client';
import { RfbMunicipalityResolver } from './infrastructure/rfb/rfb-municipality.resolver';
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
    LocalityPublisherPostgis,
    { provide: LOCALITY_PUBLISHER, useExisting: LocalityPublisherPostgis },
    RegionIndicatorPublisherPostgis,
    { provide: REGION_INDICATOR_PUBLISHER, useExisting: RegionIndicatorPublisherPostgis },
    EstablishmentPublisherPostgis,
    { provide: ESTABLISHMENT_PUBLISHER, useExisting: EstablishmentPublisherPostgis },
    AddressPublisherPostgis,
    { provide: ADDRESS_PUBLISHER, useExisting: AddressPublisherPostgis },
    IbgeMalhaClient,
    IbgeCensoClient,
    CnefeClient,
    IbgeEstimativasClient,
    RfbCnpjClient,
    RfbMunicipalityResolver,
    GeoShapefileSource,
    IbgeMalhaAdapter,
    IbgeBairroAdapter,
    IbgeSetorAdapter,
    IbgeCensoAdapter,
    IbgeLocalidadesAdapter,
    IbgeEstimativasAdapter,
    CnefeAdapter,
    RfbCnpjAdapter,
    {
      provide: DATASET_ADAPTERS,
      useFactory: (
        malha: IbgeMalhaAdapter,
        bairro: IbgeBairroAdapter,
        setor: IbgeSetorAdapter,
        censo: IbgeCensoAdapter,
        localidades: IbgeLocalidadesAdapter,
        estimativas: IbgeEstimativasAdapter,
        cnefe: CnefeAdapter,
        cnpj: RfbCnpjAdapter,
      ): DatasetAdapter[] => [malha, bairro, setor, censo, localidades, estimativas, cnefe, cnpj],
      inject: [
        IbgeMalhaAdapter,
        IbgeBairroAdapter,
        IbgeSetorAdapter,
        IbgeCensoAdapter,
        IbgeLocalidadesAdapter,
        IbgeEstimativasAdapter,
        CnefeAdapter,
        RfbCnpjAdapter,
      ],
    },
    GeoIngestionMetrics,
    GeoIngestionRunner,
    IngestionScheduler,
  ],
})
export class GeoIngestionModule {}
