import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { RECONCILE_CONTACT_STATS } from './jobs/reconcile-contact-stats.job';

const BATCH_SIZE = 100;

@Injectable()
export class ContactStatsSweepService {
  constructor(
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.bulk) private readonly bulk: Queue,
  ) {}

  async scheduleReconciliation() {
    const day = this.clock.now().toISOString().slice(0, 10);
    let after: string | null = null;
    for (;;) {
      const stores = await this.stores.maintenanceStoreIds(after, BATCH_SIZE);
      await this.bulk.addBulk(
        stores.map((storeId) => ({
          name: RECONCILE_CONTACT_STATS,
          data: { storeId },
          opts: {
            jobId: `${RECONCILE_CONTACT_STATS}-${storeId}-${day}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
            removeOnComplete: { age: DAY_MS / 1000 },
            removeOnFail: 100,
          },
        })),
      );
      if (stores.length < BATCH_SIZE) return;
      after = stores[stores.length - 1]!;
    }
  }
}
