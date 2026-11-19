import { createHash } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
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
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
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
    const { storeId, after, ranking, day } = repair;
    if (day !== this.clock.now().toISOString().slice(0, 10)) return;
    const next = await this.stats.reconcilePage(storeId, after, ranking, day);
    if (next) {
      await this.bulk.addBulk([repairJob({ ...repair, after: next })]);
    } else if (ranking.kind === 'totals') {
      const firstRankPage = {
        ...repair,
        after: null,
        ranking: { kind: 'rank', cutoff: null },
      } as const;
      if (await this.bulk.getJob(repairJobId(firstRankPage))) return;
      const cutoff = await this.stats.bestSpendCutoff(storeId);
      await this.bulk.addBulk([repairJob({ ...firstRankPage, ranking: { kind: 'rank', cutoff } })]);
    } else {
      const now = this.clock.now();
      if (now.toISOString().slice(0, 10) !== day) return;
      await this.transaction.run(storeId, async () => {
        const timeZone = await this.stores.timeZone(storeId);
        await this.outbox.publish({
          id: completionId(storeId, day),
          type: 'contact_stats.repaired',
          storeId,
          occurredAt: now.toISOString(),
          payload: { day: new Intl.DateTimeFormat('en-CA', { timeZone }).format(now) },
        });
      });
    }
  }
}

function repairJob(data: Repair) {
  return {
    name: RECONCILE_CONTACT_STATS,
    data,
    opts: {
      jobId: repairJobId(data),
      attempts: 3,
      backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
      removeOnComplete: { age: DAY_MS / 1000 },
      removeOnFail: 100,
    },
  };
}

function repairJobId(data: Repair): string {
  return `${RECONCILE_CONTACT_STATS}-${data.storeId}-${data.day}-${data.ranking.kind}-${data.after ?? 'start'}`;
}

function completionId(storeId: string, day: string) {
  // A terminal page retry can cross local midnight after committing the first event.
  const timestamp = Date.parse(day).toString(16).padStart(12, '0');
  const hash = createHash('sha256')
    .update(`contact_stats.repaired:${storeId}:${day}`)
    .digest('hex');
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${hash.slice(0, 3)}-8${hash.slice(3, 6)}-${hash.slice(6, 18)}`;
}
