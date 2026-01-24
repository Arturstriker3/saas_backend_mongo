import { Module } from '@nestjs/common';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './common/database/database.module';
import { MetricsModule } from './common/metrics/metrics.module';

@Module({
  imports: [DatabaseModule, MetricsModule, UserModule, AuthModule],
})
export class AppModule {}
