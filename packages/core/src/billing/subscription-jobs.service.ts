import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { BillingRepository } from './billing.repository';
import { RENEW_SUBSCRIPTION } from './jobs/renew-subscription.job';

const PAGE_SIZE = 100;

@Injectable()
export class SubscriptionJobsService {
  constructor(
    @Inject(BillingRepository) private readonly repository: BillingRepository,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.payments) private readonly queue: Queue,
  ) {}

  async scheduleRenewals() {
    const now = this.clock.now();
    const day = Math.floor(now.getTime() / DAY_MS);
    let after: string | null = null;
    for (;;) {
      const storeIds = await this.repository.dueRenewals(now, after, PAGE_SIZE);
      await this.queue.addBulk(
        storeIds.map((storeId) => ({
          name: RENEW_SUBSCRIPTION,
          data: { storeId },
          opts: {
            // One job per store per day, so a repeated sweep does not renew twice.
            jobId: `${RENEW_SUBSCRIPTION}-${storeId}-${day}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        })),
      );
      if (storeIds.length < PAGE_SIZE) return;
      after = storeIds.at(-1) ?? null;
    }
  }
}
