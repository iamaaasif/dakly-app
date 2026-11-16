import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { JobsOptions, Queue } from 'bullmq';

import { HandlesJob } from '../queue/job-handler';
import { QUEUES, type QueueName } from '../queue/queues';
import { JOB_POLL_INTERVAL_MS } from '../time';
import { SubscribedEvent } from './handles-event';
import { OutboxRepository } from './outbox.repository';

const RELAY_BATCH_SIZE = 100;

const subscriberJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
  // A relay that queued but did not mark retries after the one-minute re-claim, at most ten
  // times. Keeping the completed job an hour makes those re-adds no-ops, with room for a restart.
  removeOnComplete: { age: 60 * 60 },
  removeOnFail: 100,
} satisfies JobsOptions;

type SubscriberJob = { name: string; data: unknown; opts: JobsOptions };
type Subscriber = { queue: QueueName; name: string };

@Injectable()
export class OutboxRelayService implements OnModuleInit {
  private readonly subscribers = new Map<string, Subscriber[]>();
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @InjectQueue(QUEUES.transactional) transactional: Queue,
    @InjectQueue(QUEUES.bulk) bulk: Queue,
  ) {
    this.queues = { transactional, bulk };
  }

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders({ metadataKey: HandlesJob.KEY })) {
      const type = this.reflector.get(SubscribedEvent, wrapper.instance.constructor);
      if (!type) continue;
      const { queue, name } = this.discovery.getMetadataByDecorator(HandlesJob, wrapper)!;
      this.subscribers.set(type, [...(this.subscribers.get(type) ?? []), { queue, name }]);
    }
  }

  // Claim, queue, then mark, each with no transaction open. A run that stops before marking
  // leaves its rows to be claimed again; the job ids drop the repeated jobs (P5).
  async relay() {
    const events = await this.repository.claim(RELAY_BATCH_SIZE);
    if (events.length === 0) return;
    const jobs: Record<QueueName, SubscriberJob[]> = { transactional: [], bulk: [] };
    for (const event of events)
      for (const { queue, name } of this.subscribers.get(event.type) ?? [])
        jobs[queue].push({
          name,
          data: event,
          opts: { ...subscriberJobOptions, jobId: `${event.id}-${name}` },
        });
    await Promise.all(
      Object.values(QUEUES)
        .filter((queue) => jobs[queue].length > 0)
        .map((queue) => this.queues[queue].addBulk(jobs[queue])),
    );
    await this.repository.markPublished(events.map((event) => event.id));
  }
}
