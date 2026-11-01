import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../../../common/config/env';
import { DATASET_ADAPTERS, type DatasetAdapter } from '../domain/dataset-adapter.interface';
import {
  INGESTION_JOB_REPOSITORY,
  type IngestionJobRepository,
} from '../domain/ingestion-job.repository.interface';
import type { IngestionJob } from '../domain/ingestion-job.types';
import { GeoIngestionMetrics } from '../infrastructure/metrics/geo-ingestion.metrics';

const HEARTBEAT_INTERVAL_MS = 60_000;
const REAP_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class GeoIngestionRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('GeoIngestion');
  private readonly adapters = new Map<string, DatasetAdapter>();
  private readonly workerId = `geo-worker-${process.pid}`;
  private stopping = false;
  private staleMinutes = 30;
  private lastReapAt = 0;
  private loop?: Promise<void>;

  constructor(
    @Inject(INGESTION_JOB_REPOSITORY) private readonly jobs: IngestionJobRepository,
    @Inject(DATASET_ADAPTERS) adapters: DatasetAdapter[],
    private readonly metrics: GeoIngestionMetrics,
  ) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.datasetKey, adapter);
    }
  }

  async onModuleInit(): Promise<void> {
    const env = loadEnv();
    this.staleMinutes = Number.parseInt(env.GEO_JOB_STALE_MINUTES, 10);
    const pollIntervalMs = Number.parseInt(env.GEO_JOB_POLL_SECONDS, 10) * 1000;

    await this.reap();

    this.logger.log(`Listening for ingestion jobs (${this.adapters.size} adapter(s) registered)`);
    this.loop = this.consume(pollIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.loop;
  }

  /** Returns jobs left behind by a dead worker back to the queue. */
  private async reap(): Promise<void> {
    this.lastReapAt = Date.now();
    const reaped = await this.jobs.reapStale(this.staleMinutes);
    if (reaped > 0) {
      this.logger.warn(`Requeued ${reaped} stale job(s)`);
    }
  }

  private async consume(pollIntervalMs: number): Promise<void> {
    while (!this.stopping) {
      try {
        if (Date.now() - this.lastReapAt >= REAP_INTERVAL_MS) await this.reap();

        const job = await this.jobs.claim(this.workerId);
        if (!job) {
          await sleep(pollIntervalMs);
          continue;
        }
        await this.execute(job);
      } catch (error) {
        this.logger.error(`Queue loop failed: ${toMessage(error)}`);
        await sleep(pollIntervalMs);
      }
    }
  }

  private async execute(job: IngestionJob): Promise<void> {
    const startedAt = Date.now();
    const adapter = this.adapters.get(job.datasetKey);
    if (!adapter) {
      await this.jobs.fail(job.id, `No adapter registered for dataset ${job.datasetKey}`);
      this.metrics.recordFailure(job.datasetKey, 'no_adapter', elapsedSeconds(startedAt));
      this.logger.error(`Job ${job.id}: no adapter registered for ${job.datasetKey}`);
      return;
    }

    this.logger.log(
      `Job ${job.id}: ingesting ${job.datasetKey} ${job.reference} (attempt ${job.attempts + 1}/${job.maxAttempts})`,
    );

    const heartbeat = setInterval(() => {
      void this.jobs
        .heartbeat(job.id)
        .catch((error: unknown) => this.logger.warn(`Heartbeat failed: ${toMessage(error)}`));
    }, HEARTBEAT_INTERVAL_MS);

    try {
      await adapter.ingest(job.reference);
      await this.jobs.complete(job.id);
      this.metrics.recordSuccess(job.datasetKey, elapsedSeconds(startedAt));
      this.logger.log(`Job ${job.id}: published ${job.datasetKey} ${job.reference}`);
    } catch (error) {
      await this.jobs.fail(job.id, toMessage(error));
      this.metrics.recordFailure(job.datasetKey, 'failed', elapsedSeconds(startedAt));
      this.logger.error(`Job ${job.id} failed: ${toMessage(error)}`);
    } finally {
      clearInterval(heartbeat);
    }
  }
}

function elapsedSeconds(startedAt: number): number {
  return (Date.now() - startedAt) / 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
