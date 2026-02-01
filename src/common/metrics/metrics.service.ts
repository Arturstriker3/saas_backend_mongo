import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

type HttpLabelName = 'method' | 'route' | 'status';
const METRICS_START = Symbol('metricsStart');
type HttpRequestLike = {
  method: string;
  routeOptions?: { url?: string };
  raw?: { url?: string };
  routerPath?: string;
  [METRICS_START]?: bigint;
};
type HttpReplyLike = { statusCode: number };
type FastifyHookHandler = (
  req: HttpRequestLike,
  reply: HttpReplyLike,
  done?: (error?: Error) => void,
) => void | Promise<void>;
type FastifyHookable = {
  addHook: {
    (name: 'onRequest', hook: FastifyHookHandler): void;
    (name: 'onResponse', hook: FastifyHookHandler): void;
  };
};

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

  registerHttpMetrics(instance: FastifyHookable): void {
    instance.addHook('onRequest', (req, _reply, done) => {
      req[METRICS_START] = process.hrtime.bigint();
      if (done) done();
    });
    instance.addHook('onResponse', (req, reply, done) => {
      const start = req[METRICS_START];
      if (!start) {
        if (done) done();
        return;
      }
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = this.resolveRoute(req);
      const status = String(reply.statusCode);
      const labels = { method: req.method, route, status };
      this.httpDuration.observe(labels, durationSeconds);
      this.httpRequests.inc(labels);
      if (done) done();
    });
  }

  private resolveRoute(req: HttpRequestLike): string {
    const routeUrl = req.routeOptions?.url;
    if (routeUrl) return routeUrl;
    const routerPath = (req as { routerPath?: string }).routerPath;
    if (routerPath) return routerPath;
    const rawUrl = req.raw?.url;
    if (rawUrl) return rawUrl;
    return 'unknown';
  }
}
