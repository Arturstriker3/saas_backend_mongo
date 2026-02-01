import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './common/database/database.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { loadEnv } from './common/config/env';

const env = loadEnv();

@Module({
  imports: [
    DatabaseModule,
    MetricsModule,
    UserModule,
    AuthModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: parseInt(env.RATE_LIMIT_GLOBAL_TTL, 10),
          limit: parseInt(env.RATE_LIMIT_GLOBAL_LIMIT, 10),
        },
      ],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
