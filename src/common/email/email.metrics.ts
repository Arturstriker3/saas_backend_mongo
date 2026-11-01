import { Inject, Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';
import { WORKER_METRICS_REGISTRY } from '../metrics/worker-metrics.registry';

export type EmailOutcome = 'sent' | 'failed';

@Injectable()
export class EmailMetrics {
  private readonly messages: Counter<'queue' | 'outcome'>;
  private readonly duration: Histogram<'queue' | 'outcome'>;

  constructor(@Inject(WORKER_METRICS_REGISTRY) registry: Registry) {
    this.messages = new Counter({
      name: 'email_messages_total',
      help: 'Email messages handled by the worker',
      labelNames: ['queue', 'outcome'],
      registers: [registry],
    });

    this.duration = new Histogram({
      name: 'email_message_duration_seconds',
      help: 'Email message handling duration in seconds',
      labelNames: ['queue', 'outcome'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [registry],
    });
  }

  record(queue: string, outcome: EmailOutcome, seconds: number): void {
    this.messages.inc({ queue, outcome });
    this.duration.observe({ queue, outcome }, seconds);
  }
}
