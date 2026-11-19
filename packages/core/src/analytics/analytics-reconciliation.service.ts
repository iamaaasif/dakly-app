import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { AnalyticsSummariesService } from './analytics-summaries.service';
import { shiftReportDay } from './report-period';

export const RECONCILE_ANALYTICS = 'reconcile-analytics';
export const analyticsReconciliationPayload = z.strictObject({
  storeId: z.uuid(),
  day: z.iso.date(),
  page: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('orders'),
      period: z.strictObject({ from: z.iso.date(), through: z.iso.date() }).nullable(),
    }),
    z.strictObject({ kind: z.literal('buyers'), after: z.uuid().nullable() }),
    z.strictObject({ kind: z.literal('retention'), batch: z.int().nonnegative() }),
    z.strictObject({ kind: z.literal('lifecycle') }),
  ]),
});
type Repair = z.infer<typeof analyticsReconciliationPayload>;

@Injectable()
export class AnalyticsReconciliationService {
  constructor(
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(AnalyticsSummariesService) private readonly summaries: AnalyticsSummariesService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.bulk) private readonly queue: Queue,
  ) {}

  async schedule() {
    const day = this.clock.now().toISOString().slice(0, 10);
    let after: string | null = null;
    for (;;) {
      const stores = await this.stores.maintenanceStoreIds(after, 100);
      await this.queue.addBulk(
        stores.map((storeId) =>
          reconciliationJob({ storeId, day, page: { kind: 'orders', period: null } }),
        ),
      );
      if (stores.length < 100) return;
      after = stores.at(-1) ?? null;
    }
  }

  async scheduleLifecycle(storeId: string, day: string) {
    await this.queue.addBulk([reconciliationJob({ storeId, day, page: { kind: 'lifecycle' } })]);
  }

  async reconcile(repair: Repair) {
    const { storeId, day, page } = repair;
    if (page.kind === 'lifecycle') return this.summaries.refreshLifecycle(storeId, day);
    if (page.kind === 'retention') {
      if (await this.summaries.pruneExpiredRows(storeId))
        await this.queue.addBulk([
          reconciliationJob({ ...repair, page: { kind: 'retention', batch: page.batch + 1 } }),
        ]);
      return;
    }
    if (page.kind === 'buyers') {
      const after = await this.summaries.reconcileBuyerPage(storeId, page.after);
      const next: Repair['page'] = after
        ? { kind: 'buyers', after }
        : { kind: 'retention', batch: 0 };
      await this.queue.addBulk([reconciliationJob({ ...repair, page: next })]);
      return;
    }

    const { from, through } = page.period ?? (await this.summaries.reconciliationRange(storeId));
    const lastDay = shiftReportDay(from, 30);
    await this.summaries.refreshOrderDays(storeId, {
      from,
      through: lastDay < through ? lastDay : through,
    });
    const next: Repair['page'] =
      lastDay < through
        ? { kind: 'orders', period: { from: shiftReportDay(lastDay, 1), through } }
        : { kind: 'buyers', after: null };
    await this.queue.addBulk([reconciliationJob({ ...repair, page: next })]);
  }
}

function reconciliationJob(data: Repair) {
  const { page, storeId, day } = data;
  let cursor: string | number | undefined | null;
  if (page.kind === 'orders') cursor = page.period?.from;
  else if (page.kind === 'buyers') cursor = page.after;
  else if (page.kind === 'retention') cursor = page.batch;
  return {
    name: RECONCILE_ANALYTICS,
    data,
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
      removeOnComplete: { age: DAY_MS / 1000 },
      removeOnFail: 100,
      jobId: `${RECONCILE_ANALYTICS}-${storeId}-${day}-${page.kind}-${cursor ?? 'start'}`,
    },
  };
}
