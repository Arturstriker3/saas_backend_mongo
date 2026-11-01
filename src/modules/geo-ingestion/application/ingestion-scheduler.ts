import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../../../common/config/env';
import { DATASET_ADAPTERS, type DatasetAdapter } from '../domain/dataset-adapter.interface';
import {
  INGESTION_JOB_REPOSITORY,
  type IngestionJobRepository,
} from '../domain/ingestion-job.repository.interface';
import {
  INGESTION_SCHEDULE_REPOSITORY,
  type DueSchedule,
  type IngestionScheduleRepository,
} from '../domain/ingestion-schedule.repository.interface';

/**
 * Keeps the queue fed: on every tick it enqueues the datasets whose cadence
 * window has elapsed, so collection runs without a manual command.
 */
@Injectable()
export class IngestionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('GeoScheduler');
  private readonly adapters = new Map<string, DatasetAdapter>();
  private stopping = false;
  private loop?: Promise<void>;

  constructor(
    @Inject(INGESTION_SCHEDULE_REPOSITORY)
    private readonly schedules: IngestionScheduleRepository,
    @Inject(INGESTION_JOB_REPOSITORY) private readonly jobs: IngestionJobRepository,
    @Inject(DATASET_ADAPTERS) adapters: DatasetAdapter[],
  ) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.datasetKey, adapter);
    }
  }

  async onModuleInit(): Promise<void> {
    const tickSeconds = Number.parseInt(loadEnv().GEO_SCHEDULER_TICK_SECONDS, 10);
    this.logger.log(`Checking dataset cadence every ${tickSeconds}s`);
    this.loop = this.run(tickSeconds * 1000);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.loop;
  }

  private async run(intervalMs: number): Promise<void> {
    while (!this.stopping) {
      await this.runOnce();
      await sleep(intervalMs);
    }
  }

  private async runOnce(): Promise<void> {
    try {
      const due = await this.schedules.findDue();
      for (const schedule of due) {
        await this.enqueue(schedule);
      }
    } catch (error) {
      this.logger.error(`Schedule check failed: ${toMessage(error)}`);
    }
  }

  /**
   * Queues one dataset. Datasets without a collector are still listed in the
   * schedule ahead of their adapter, so they are skipped instead of failing a job.
   */
  private async enqueue(schedule: DueSchedule): Promise<void> {
    const adapter = this.adapters.get(schedule.datasetKey);
    if (!adapter) return;

    const reference = await this.resolveReference(adapter, schedule);
    const jobId = await this.jobs.enqueue(schedule.datasetKey, reference);
    await this.schedules.markQueued(schedule.datasetKey, reference);
    this.logger.log(`${schedule.datasetKey} ${reference} queued (job ${jobId})`);
  }

  /** Prefers the reference published at the source, falling back to the last used one. */
  private async resolveReference(adapter: DatasetAdapter, schedule: DueSchedule): Promise<string> {
    const fallback = schedule.lastReference ?? adapter.defaultReference;
    if (!adapter.discoverReference) return fallback;

    try {
      const discovered = await adapter.discoverReference();
      if (schedule.lastReference && schedule.lastReference !== discovered) {
        this.logger.log(
          `${adapter.datasetKey}: new source revision ${discovered} (was ${schedule.lastReference})`,
        );
      }
      return discovered;
    } catch (error) {
      this.logger.warn(
        `Could not resolve ${adapter.datasetKey}: ${toMessage(error)}; reusing ${fallback}`,
      );
      return fallback;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
