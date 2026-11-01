import { Module } from '@nestjs/common';
import { EmailModule } from './common/email/email.module';
import { WorkerMetricsServerModule } from './common/metrics/worker-metrics.server';

@Module({
  imports: [
    EmailModule,
    WorkerMetricsServerModule.register({
      portEnvKey: 'EMAIL_WORKER_METRICS_PORT',
      defaultPort: 9465,
    }),
  ],
})
export class WorkerEmailModule {}
