import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerGeoModule } from './worker-geo.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerGeoModule);
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  Logger.log('🟢 Geo worker listening for ingestion jobs', 'WorkerGeo');
}

bootstrap();
