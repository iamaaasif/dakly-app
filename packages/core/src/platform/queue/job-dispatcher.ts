import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';

import { ErrorReporter } from '../logging/error-reporter';
import { runWithJobContext } from '../logging/job-context';
import { serializeError } from '../logging/safe-error';
import { HandlesJob, type JobHandler } from './job-handler';
import { QUEUES, type QueueName } from './queues';

// Overlapping transactional runs are safe: each job claims its notice or alert under a lease first.
const TRANSACTIONAL_JOBS_AT_ONCE = 5;
const AI_REPLY_JOBS_AT_ONCE = 5;
const BULK_JOBS_AT_ONCE = 1;
// Each step job guards its writes with the run's claim, so steps of many runs run side by side.
const WORKFLOW_JOBS_AT_ONCE = 5;
// One job at a time per worker. Campaign jobs still tolerate overlap between workers.
const CAMPAIGN_JOBS_AT_ONCE = 1;
// A payment check is a vendor call, so it gets the same limit as transactional jobs.
const PAYMENT_JOBS_AT_ONCE = 5;
const concurrency = {
  inbound: TRANSACTIONAL_JOBS_AT_ONCE,
  'ai-reply': AI_REPLY_JOBS_AT_ONCE,
  outbound: TRANSACTIONAL_JOBS_AT_ONCE,
  sync: 1,
  transactional: TRANSACTIONAL_JOBS_AT_ONCE,
  bulk: BULK_JOBS_AT_ONCE,
  workflow: WORKFLOW_JOBS_AT_ONCE,
  campaign: CAMPAIGN_JOBS_AT_ONCE,
  payments: PAYMENT_JOBS_AT_ONCE,
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

  async process(job: Job, token?: string) {
    const { id: jobId } = job;
    if (!jobId) throw new UnrecoverableError('Cannot dispatch a job without an ID');
    const handler = this.handlers.get(job.name);
    if (!handler)
      throw new UnrecoverableError(`No handler for job ${job.name} on queue ${this.queue}`);
    const failure = `${job.name.charAt(0).toUpperCase()}${job.name.slice(1).replaceAll('-', ' ')} job failed`;
    const delayed = await runWithJobContext(async () => {
      let failed = false;
      try {
        const result = await handler.handle(
          job.data,
          job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        );
        if (result) {
          await job.moveToDelayed(result.delayUntil, token);
          return true;
        }
        await job.updateProgress(100);
      } catch (error) {
        this.reporter.reportJob(serializeError(error), jobId);
        this.logger.error({ event: 'security', jobId }, failure);
        failed = true;
      }
      // BullMQ persists failures; only the sanitized reporter receives the original error.
      if (failed) throw new Error(failure);
      return false;
    }, jobId);
    if (delayed) throw new DelayedError();
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

@Processor(QUEUES.aiReply, { concurrency: concurrency['ai-reply'], autorun: false })
export class AiReplyJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.aiReply, discovery, reporter);
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

@Processor(QUEUES.workflow, { concurrency: concurrency.workflow, autorun: false })
export class WorkflowJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.workflow, discovery, reporter);
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

@Processor(QUEUES.inbound, { concurrency: concurrency.inbound, autorun: false })
export class InboundJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.inbound, discovery, reporter);
  }
}

@Processor(QUEUES.sync, { concurrency: concurrency.sync, autorun: false })
export class SyncJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.sync, discovery, reporter);
  }
}

@Processor(QUEUES.outbound, { concurrency: concurrency.outbound, autorun: false })
export class OutboundJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.outbound, discovery, reporter);
  }
}

@Processor(QUEUES.payments, { concurrency: concurrency.payments, autorun: false })
export class PaymentsJobDispatcher extends JobDispatcher {
  constructor(
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ErrorReporter) reporter: ErrorReporter,
  ) {
    super(QUEUES.payments, discovery, reporter);
  }
}
