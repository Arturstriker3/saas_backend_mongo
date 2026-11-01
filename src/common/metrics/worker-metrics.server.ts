import {
  DynamicModule,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Server, ServerResponse, createServer } from 'node:http';
import { Registry } from 'prom-client';
import { loadEnv, type AppEnv } from '../config/env';
import { WORKER_METRICS_REGISTRY, WorkerMetricsRegistryModule } from './worker-metrics.registry';

export const WORKER_METRICS_PORT = 'WORKER_METRICS_PORT';

export interface WorkerMetricsOptions {
  portEnvKey: 'GEO_WORKER_METRICS_PORT' | 'EMAIL_WORKER_METRICS_PORT';
  defaultPort: number;
}

@Injectable()
export class WorkerMetricsServer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('WorkerMetrics');
  private server?: Server;

  constructor(
    @Inject(WORKER_METRICS_REGISTRY) private readonly registry: Registry,
    @Inject(WORKER_METRICS_PORT) private readonly port: number,
  ) {}

  async onModuleInit(): Promise<void> {
    if (loadEnv().WORKER_METRICS_ENABLED !== 'true') {
      this.logger.warn('Metrics endpoint disabled by WORKER_METRICS_ENABLED');
      return;
    }

    const server = createServer((request, response) => {
      void this.handleRequest(request.url, response);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      this.logger.error(
        `Metrics server could not start on :${this.port} (${error.code ?? 'error'}). ` +
          'The worker keeps running without the endpoint.',
      );
    });

    server.listen(this.port, () => {
      this.logger.log(`Metrics available on :${this.port}/metrics`);
    });

    this.server = server;
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handleRequest(url: string | undefined, response: ServerResponse): Promise<void> {
    if (url !== '/metrics') {
      response.writeHead(404).end();
      return;
    }

    try {
      const body = await this.registry.metrics();
      response.writeHead(200, { 'Content-Type': this.registry.contentType });
      response.end(body);
    } catch (error) {
      this.logger.error(`Failed to render metrics: ${String(error)}`);
      response.writeHead(500).end();
    }
  }
}

@Module({})
export class WorkerMetricsServerModule {
  /**
   * Starts the metrics endpoint inside a worker process.
   * @param options - Env key holding the port and the fallback when it is not set.
   */
  static register(options: WorkerMetricsOptions): DynamicModule {
    return {
      module: WorkerMetricsServerModule,
      imports: [WorkerMetricsRegistryModule],
      providers: [
        { provide: WORKER_METRICS_PORT, useValue: resolvePort(options) },
        WorkerMetricsServer,
      ],
    };
  }
}

function resolvePort(options: WorkerMetricsOptions): number {
  const configured = Number.parseInt(loadEnv()[options.portEnvKey as keyof AppEnv], 10);
  return Number.isNaN(configured) ? options.defaultPort : configured;
}
