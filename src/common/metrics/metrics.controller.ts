import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { loadEnv } from '../config/env';
import { MetricsService } from './metrics.service';

const env = loadEnv();

@Controller(env.METRICS_ROUTE)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // @SkipThrottle()
  @Get()
  async getMetrics(@Res() res: FastifyReply): Promise<void> {
    if (env.METRICS_ENABLED !== 'true') {
      throw new NotFoundException();
    }
    const body = await this.metrics.metrics();
    res.header('Content-Type', this.metrics.contentType);
    res.send(body);
  }
}
