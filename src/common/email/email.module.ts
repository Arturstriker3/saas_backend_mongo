import { Module } from '@nestjs/common';
import { resendClientProvider } from './resend.client';
import { EmailService } from './email.service';

@Module({
  providers: [resendClientProvider, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
