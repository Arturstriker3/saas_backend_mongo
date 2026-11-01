import { Module } from '@nestjs/common';
import { GeoDatabaseModule } from './common/database/geo/geo.module';
import { WorkerMetricsServerModule } from './common/metrics/worker-metrics.server';
import { GeoIngestionModule } from './modules/geo-ingestion/geo-ingestion.module';

@Module({
  imports: [
    GeoDatabaseModule,
    GeoIngestionModule,
    WorkerMetricsServerModule.register({
      portEnvKey: 'GEO_WORKER_METRICS_PORT',
      defaultPort: 9464,
    }),
  ],
})
export class WorkerGeoModule {}
