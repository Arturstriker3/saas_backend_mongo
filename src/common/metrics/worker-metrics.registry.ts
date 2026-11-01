import { Module, Provider } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';

export const WORKER_METRICS_REGISTRY = 'WORKER_METRICS_REGISTRY';

function createWorkerRegistry(): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  return registry;
}

const workerMetricsRegistryProvider: Provider = {
  provide: WORKER_METRICS_REGISTRY,
  useFactory: createWorkerRegistry,
};

@Module({
  providers: [workerMetricsRegistryProvider],
  exports: [WORKER_METRICS_REGISTRY],
})
export class WorkerMetricsRegistryModule {}
