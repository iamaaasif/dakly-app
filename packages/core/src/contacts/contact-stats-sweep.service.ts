import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { ContactStatsService } from './contact-stats.service';

const STORE_PAGE_SIZE = 100;
export const RECONCILE_CONTACT_STATS = 'reconcile-contact-stats';

export const reconcileContactStatsPayload = z.strictObject({
  storeId: z.uuid(),
  day: z.iso.date(),
  after: z.uuid().nullable(),
  ranking: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('totals') }),
    z.strictObject({
      kind: z.literal('rank'),
      cutoff: z
        .strictObject({
          contactId: z.uuid(),
          netSpendPoisha: z.string().regex(/^\d{1,19}$/),
        })
        .nullable(),
    }),
  ]),
});
type Repair = z.infer<typeof reconcileContactStatsPayload>;

@Injectable()
export class ContactStatsSweepService {
  constructor(
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(ContactStatsService) private readonly stats: ContactStatsService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.bulk) private readonly bulk: Queue,
  ) {}

  async scheduleReconciliation() {
    const day = this.clock.now().toISOString().slice(0, 10);
    let after: string | null = null;
    for (;;) {
      const stores = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      await this.bulk.addBulk(
        stores.map((storeId) =>
          repairJob({ storeId, day, after: null, ranking: { kind: 'totals' } }),
        ),
      );
      if (stores.length < STORE_PAGE_SIZE) return;
      after = stores.at(-1) ?? null;
    }
  }

  async reconcile(repair: Repair) {
    const { storeId, after, ranking } = repair;
    const next = await this.stats.reconcilePage(storeId, after, ranking);
    if (next) {
      await this.bulk.addBulk([repairJob({ ...repair, after: next })]);
    } else if (ranking.kind === 'totals') {
      // Wait until all spend totals are repaired before taking a store-wide ranking.
      const cutoff = await this.stats.bestSpendCutoff(storeId);
      await this.bulk.addBulk([
        repairJob({ ...repair, after: null, ranking: { kind: 'rank', cutoff } }),
      ]);
    }
  }
}

function repairJob(data: Repair) {
  return {
    name: RECONCILE_CONTACT_STATS,
    data,
    opts: {
      jobId: `${RECONCILE_CONTACT_STATS}-${data.storeId}-${data.day}-${data.ranking.kind}-${data.after ?? 'start'}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
      removeOnComplete: { age: DAY_MS / 1000 },
      removeOnFail: 100,
    },
  };
}
