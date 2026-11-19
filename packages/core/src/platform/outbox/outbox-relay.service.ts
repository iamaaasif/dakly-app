import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { JobsOptions, Queue } from 'bullmq';

import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { HandlesJob } from '../queue/job-handler';
import { QUEUES, type QueueName, WORKER_QUEUES } from '../queue/queues';
import { JOB_POLL_INTERVAL_MS } from '../time';
import { SubscribedEvent } from './handles-event';
import { OutboxRepository } from './outbox.repository';

const RELAY_BATCH_SIZE = 100;
// claim_outbox_events stops claiming a row at the same number of attempts.
const RELAY_ATTEMPT_LIMIT = 10;

const subscriberJobOptions = {
  attempts: 3,
  // A relay that queued but did not mark is re-claimed a minute later, at most ten times. Keeping
  // completed jobs an hour drops those re-adds; a relay outage longer than that can queue a job
  // twice, which is why subscribers stay idempotent.
  removeOnComplete: { age: 60 * 60 },
  removeOnFail: 100,
} satisfies JobsOptions;

type SubscriberJob = { name: string; data: unknown; opts: JobsOptions };
type Subscriber = { queue: QueueName; name: string; retryBackoffMs?: number };

@Injectable()
export class OutboxRelayService implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly subscribers = new Map<string, Subscriber[]>();
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @InjectQueue(QUEUES.inbound) inbound: Queue,
    @InjectQueue(QUEUES.aiReply) aiReply: Queue,
    @InjectQueue(QUEUES.outbound) outbound: Queue,
    @InjectQueue(QUEUES.sync) sync: Queue,
    @InjectQueue(QUEUES.transactional) transactional: Queue,
    @InjectQueue(QUEUES.bulk) bulk: Queue,
    @InjectQueue(QUEUES.workflow) workflow: Queue,
    @InjectQueue(QUEUES.campaign) campaign: Queue,
    @InjectQueue(QUEUES.payments) payments: Queue,
  ) {
    this.queues = {
      inbound,
      'ai-reply': aiReply,
      outbound,
      sync,
      transactional,
      bulk,
      workflow,
      campaign,
      payments,
    };
  }

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders({ metadataKey: HandlesJob.KEY })) {
      const event = this.reflector.get(SubscribedEvent, wrapper.instance.constructor);
      if (!event) continue;
      const { queue, name } = this.discovery.getMetadataByDecorator(HandlesJob, wrapper)!;
      this.subscribers.set(event.type, [
        ...(this.subscribers.get(event.type) ?? []),
        { queue, name, retryBackoffMs: event.retryBackoffMs },
      ]);
    }
  }

  // Claim, queue, then mark, each with no transaction open. A run that stops before marking
  // leaves its rows to be claimed again; the job ids drop the repeated jobs (P5).
  async relay() {
    const events = await this.repository.claim(RELAY_BATCH_SIZE);
    if (events.length === 0) return;
    const jobs: Record<QueueName, SubscriberJob[]> = {
      inbound: [],
      'ai-reply': [],
      outbound: [],
      sync: [],
      transactional: [],
      bulk: [],
      workflow: [],
      campaign: [],
      payments: [],
    };
    for (const { id, storeId, type, payload, occurredAt } of events)
      for (const { queue, name, retryBackoffMs } of this.subscribers.get(type) ?? [])
        jobs[queue].push({
          name,
          data: { id, storeId, type, payload, occurredAt },
          opts: {
            ...subscriberJobOptions,
            jobId: `${id}-${name}`,
            backoff: { type: 'exponential', delay: retryBackoffMs ?? JOB_POLL_INTERVAL_MS },
          },
        });
    try {
      await Promise.all(
        WORKER_QUEUES.filter((queue) => jobs[queue].length > 0).map((queue) =>
          this.queues[queue].addBulk(jobs[queue]),
        ),
      );
      await this.repository.markPublished(events.map((event) => event.id));
    } catch (error) {
      const parked = events.filter((event) => event.attempts >= RELAY_ATTEMPT_LIMIT);
      if (parked.length === 0) throw error;
      this.logger.error(
        { events: parked.map(({ id, type }) => ({ id, type })) },
        'Outbox events parked after their last relay attempt',
      );
      throw new AppError('OUTBOX_EVENTS_PARKED', PLATFORM_ERRORS.OUTBOX_EVENTS_PARKED);
    }
  }
}
