import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { Request, Response, NextFunction } from 'express';

type HttpLabelName = 'method' | 'route' | 'status';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpDuration: Histogram<HttpLabelName>;
  private readonly httpRequests: Counter<HttpLabelName>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    const labelNames: HttpLabelName[] = ['method', 'route', 'status'];
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames,
      registers: [this.registry],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
    });
    this.httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames,
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  httpMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        const route = this.resolveRoute(req);
        const status = String(res.statusCode);
        const labels = { method: req.method, route, status };
        this.httpDuration.observe(labels, durationSeconds);
        this.httpRequests.inc(labels);
      });
      next();
    };
  }

  private resolveRoute(req: Request): string {
    const baseUrl = req.baseUrl ?? '';
    const routePath = req.route?.path;
    if (routePath) return `${baseUrl}${routePath}`;
    if (req.path) return req.path;
    if (baseUrl) return baseUrl;
    return 'unknown';
  }
}
