import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { Response } from 'express';
import { loadEnv } from '../config/env';
import { MetricsService } from './metrics.service';

const env = loadEnv();

@Controller(env.METRICS_ROUTE)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    if (env.METRICS_ENABLED !== 'true') {
      throw new NotFoundException();
    }
    const body = await this.metrics.metrics();
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(body);
  }
}
