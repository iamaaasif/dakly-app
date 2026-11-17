import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { UnrecoverableError, type Job } from 'bullmq';

import { ErrorReporter } from '../logging/error-reporter';
import { runWithJobContext } from '../logging/job-context';
import { serializeError } from '../logging/safe-error';
import { HandlesJob, type JobHandler } from './job-handler';
import { QUEUES, type QueueName } from './queues';

// Overlapping transactional runs are safe: each job claims its notice or alert under a lease first.
const TRANSACTIONAL_JOBS_AT_ONCE = 5;
const BULK_JOBS_AT_ONCE = 1;
// One job at a time on each worker. Two workers can still run campaign jobs at once, so each
// job tolerates overlap (jobs.md).
const CAMPAIGN_JOBS_AT_ONCE = 1;
const concurrency = {
  transactional: TRANSACTIONAL_JOBS_AT_ONCE,
  bulk: BULK_JOBS_AT_ONCE,
  campaign: CAMPAIGN_JOBS_AT_ONCE,
} satisfies Record<QueueName, number>;

// BullMQ gives every job on a queue to that queue's one worker, so the worker routes by job name.
abstract class JobDispatcher extends WorkerHost implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(JobDispatcher.name);
  private readonly handlers = new Map<string, JobHandler>();

  constructor(
    private readonly queue: QueueName,
    private readonly discovery: DiscoveryService,
    private readonly reporter: ErrorReporter,
  ) {
    super();
  }

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders({ metadataKey: HandlesJob.KEY })) {
      const route = this.discovery.getMetadataByDecorator(HandlesJob, wrapper);
      if (route?.queue !== this.queue) continue;
      if (this.handlers.has(route.name))
        throw new Error(`Two handlers claim job ${route.name} on queue ${this.queue}`);
      this.handlers.set(route.name, wrapper.instance as JobHandler);
    }
  }

  // Workers are created with autorun off so no job arrives before the handlers are known.
  onApplicationBootstrap() {
    this.worker.run().catch(() => this.logger.error({ queue: this.queue }, 'Queue worker stopped'));
  }

  async process(job: Job) {
    const handler = this.handlers.get(job.name);
    if (!handler)
      throw new UnrecoverableError(`No handler for job ${job.name} on queue ${this.queue}`);
    const failure = `${job.name.charAt(0).toUpperCase()}${job.name.slice(1).replaceAll('-', ' ')} job failed`;
    return runWithJobContext(async () => {
      let failed = false;
      try {
        await handler.handle(job.data);
        await job.updateProgress(100);
      } catch (error) {
        this.reporter.reportJob(serializeError(error), job.id!);
        this.logger.error({ event: 'security', jobId: job.id }, failure);
        failed = true;
      }
      // BullMQ persists failures; only the sanitized reporter receives the original error.
      if (failed) throw new Error(failure);
    }, job.id);
  }
}

@Processor(QUEUES.transactional, { concurrency: concurrency.transactional, autorun: false })
export class TransactionalJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.transactional, discovery, reporter);
  }
}

@Processor(QUEUES.bulk, { concurrency: concurrency.bulk, autorun: false })
export class BulkJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.bulk, discovery, reporter);
  }
}

@Processor(QUEUES.campaign, { concurrency: concurrency.campaign, autorun: false })
export class CampaignJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.campaign, discovery, reporter);
  }
}
