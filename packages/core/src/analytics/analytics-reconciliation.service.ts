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
  ]),
});
type Repair = z.infer<typeof analyticsReconciliationPayload>;

@Injectable()
export class AnalyticsReconciliationService {
  constructor(
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(AnalyticsSummariesService) private readonly summaries: AnalyticsSummariesService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.sync) private readonly queue: Queue,
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

  async reconcile(repair: Repair) {
    const { day, storeId, page } = repair;
    if (day !== this.clock.now().toISOString().slice(0, 10)) return;
    if (page.kind === 'buyers') {
      const after = await this.summaries.reconcileBuyerPage(storeId, page.after);
      if (after)
        await this.queue.addBulk([
          reconciliationJob({ ...repair, page: { kind: 'buyers', after } }),
        ]);
      else await this.summaries.finishReconciliation(storeId);
      return;
    }

    const { from, through } = page.period ?? (await this.summaries.reconciliationRange(storeId));
    const lastDay = shiftReportDay(from, 30);
    await this.summaries.reconcileOrderRange(storeId, {
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
  const cursor = data.page.kind === 'orders' ? data.page.period?.from : data.page.after;
  return {
    name: RECONCILE_ANALYTICS,
    data,
    opts: {
      jobId: `${RECONCILE_ANALYTICS}-${data.storeId}-${data.day}-${data.page.kind}-${cursor ?? 'start'}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
      removeOnComplete: { age: DAY_MS / 1000 },
      removeOnFail: 100,
    },
  };
}
