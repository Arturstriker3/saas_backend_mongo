import { Module } from '@nestjs/common';
import { EmailModule } from './common/email/email.module';

@Module({
  imports: [EmailModule],
})
export class WorkerEmailModule {}
