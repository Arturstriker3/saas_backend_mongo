import { Inject, Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { WORKER_METRICS_REGISTRY } from '../../../../common/metrics/worker-metrics.registry';

type FailureOutcome = 'failed' | 'no_adapter';

@Injectable()
export class GeoIngestionMetrics {
  private readonly jobs: Counter<'dataset_key' | 'outcome'>;
  private readonly duration: Histogram<'dataset_key'>;
  private readonly lastSuccess: Gauge<'dataset_key'>;

  constructor(@Inject(WORKER_METRICS_REGISTRY) registry: Registry) {
    this.jobs = new Counter({
      name: 'geo_ingest_jobs_total',
      help: 'Ingestion jobs by outcome',
      labelNames: ['dataset_key', 'outcome'],
      registers: [registry],
    });

    this.duration = new Histogram({
      name: 'geo_ingest_duration_seconds',
      help: 'Ingestion job duration in seconds',
      labelNames: ['dataset_key'],
      buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
      registers: [registry],
    });

    this.lastSuccess = new Gauge({
      name: 'geo_ingest_last_success_timestamp_seconds',
      help: 'Unix timestamp of the last successful publication per dataset',
      labelNames: ['dataset_key'],
      registers: [registry],
    });
  }

  recordSuccess(datasetKey: string, seconds: number): void {
    this.jobs.inc({ dataset_key: datasetKey, outcome: 'completed' });
    this.duration.observe({ dataset_key: datasetKey }, seconds);
    this.lastSuccess.set({ dataset_key: datasetKey }, Date.now() / 1000);
  }

  recordFailure(datasetKey: string, outcome: FailureOutcome, seconds: number): void {
    this.jobs.inc({ dataset_key: datasetKey, outcome });
    this.duration.observe({ dataset_key: datasetKey }, seconds);
  }
}
