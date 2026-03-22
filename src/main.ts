import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { loadEnv } from './common/config/env';
import { resolveCorsOrigin } from './common/config/cors';
import { runSeed } from './common/database/seed/seed';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { MetricsService } from './common/metrics/metrics.service';
import { RabbitMQConnection, RABBITMQ_CONNECTION } from './common/messaging/rabbitmq.connection';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const env = loadEnv();
  app.enableCors({
    origin: resolveCorsOrigin(env.CORS_ALLOWED_ORIGINS),
  });
  if (env.METRICS_ENABLED === 'true') {
    const metrics = app.get(MetricsService);
    const fastify = app.getHttpAdapter().getInstance();
    metrics.registerHttpMetrics(fastify);
  }
  const rabbit = app.get<RabbitMQConnection>(RABBITMQ_CONNECTION);
  const channel = await rabbit.createChannel();
  await channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
  await channel.close();
  if (env.DOCS_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle(`${env.APP_NAME} Backend API`)
      .setVersion(env.DOCS_VERSION)
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('/docs', app, doc);
  }
  if (env.RUN_SEED_ON_STARTUP === 'true') {
    await runSeed();
  }
  await app.listen(parseInt(env.PORT, 10), '0.0.0.0');
  const base = `http://localhost:${parseInt(env.PORT, 10)}`;
  Logger.log(`🟢 API listening on ${base}`, 'Bootstrap');
}
bootstrap();
