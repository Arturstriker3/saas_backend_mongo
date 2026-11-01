import { Module } from '@nestjs/common';
import { resendClientProvider } from './resend.client';
import { EmailService } from './email.service';
import { EmailConsumers } from './email.consumers';
import { EmailMetrics } from './email.metrics';
import { MessagingModule } from '../messaging/messaging.module';
import { MetricsModule } from '../metrics/metrics.module';
import { WorkerMetricsRegistryModule } from '../metrics/worker-metrics.registry';

@Module({
  imports: [MessagingModule, MetricsModule, WorkerMetricsRegistryModule],
  providers: [resendClientProvider, EmailService, EmailConsumers, EmailMetrics],
  exports: [EmailService],
})
export class EmailModule {}
