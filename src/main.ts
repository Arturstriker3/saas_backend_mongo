import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { loadEnv } from './common/config/env';
import { runSeed } from './common/database/seed/seed';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = loadEnv();
  if (env.DOCS_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle(env.DOCS_TITLE)
      .setVersion(env.DOCS_VERSION)
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(env.DOCS_ROUTE, app, doc);
  }
  if (env.RUN_SEED_ON_STARTUP === 'true') {
    await runSeed();
  }
  await app.listen(parseInt(env.PORT, 10));
  const base = `http://localhost:${parseInt(env.PORT, 10)}`;
  Logger.log(`API listening on ${base}`, 'Bootstrap');
}
bootstrap();
