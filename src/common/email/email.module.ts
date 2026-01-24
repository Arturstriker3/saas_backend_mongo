import { Module } from '@nestjs/common';
import { resendClientProvider } from './resend.client';
import { EmailService } from './email.service';
import { EmailConsumers } from './email.consumers';
import { MessagingModule } from '../messaging/messaging.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MessagingModule, MetricsModule],
  providers: [resendClientProvider, EmailService, EmailConsumers],
  exports: [EmailService],
})
export class EmailModule {}
