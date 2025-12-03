import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { loadEnv } from './common/config/env';
import { runSeed } from './common/database/seed/seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = loadEnv();
  if (env.RUN_SEED_ON_STARTUP === 'true') {
    await runSeed();
  }
  await app.listen(parseInt(env.PORT, 10));
  const base = `http://localhost:${parseInt(env.PORT, 10)}`;
  Logger.log(`API listening on ${base}`, 'Bootstrap');
}
bootstrap();
