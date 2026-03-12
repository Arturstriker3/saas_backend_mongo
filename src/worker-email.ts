import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerEmailModule } from './worker-email.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerEmailModule);
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  Logger.log('🟣 Email worker listening for events', 'WorkerEmail');
}

bootstrap();
