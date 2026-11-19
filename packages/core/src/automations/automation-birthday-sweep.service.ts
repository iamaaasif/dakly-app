import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { RECORD_AUTOMATION_BIRTHDAYS } from './jobs/record-automation-birthdays.job';

const STORE_PAGE_SIZE = 100;

@Injectable()
export class AutomationBirthdaySweepService {
  constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
    @InjectQueue(QUEUES.bulk) private readonly bulk: Queue,
  ) {}

  async sweep() {
    const at = this.clock.now();
    const occurredAt = at.toISOString();
    let after: string | null = null;
    for (;;) {
      const stores = await this.stores.maintenanceStores(after, STORE_PAGE_SIZE);
      const jobs = [];
      for (const { storeId, timeZone } of stores) {
        const day = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' }).format(at);
        const jobId = `${RECORD_AUTOMATION_BIRTHDAYS}-${storeId}-${day}`;
        const previous = await this.bulk.getJob(jobId);
        // A failed job still owns the date's id, so the next sweep must retry it.
        if (previous && (await previous.isFailed())) {
          await previous.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
        }
        if (previous) continue;
        jobs.push({
          name: RECORD_AUTOMATION_BIRTHDAYS,
          data: { storeId, day, occurredAt },
          opts: {
            jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
            removeOnComplete: { age: (2 * DAY_MS) / 1000 },
            removeOnFail: 100,
          },
        });
      }
      if (jobs.length > 0) await this.bulk.addBulk(jobs);
      if (stores.length < STORE_PAGE_SIZE) return;
      after = stores.at(-1)?.storeId ?? null;
    }
  }
}
