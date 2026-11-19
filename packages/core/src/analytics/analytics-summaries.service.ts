import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { lifecycleStages } from '@dakly/contracts/contacts';

import { ContactStatsService } from '../contacts/contact-stats.service';
import { ContactsService } from '../contacts/contacts.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS, MINUTE_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { AnalyticsRepository } from './analytics.repository';
import { reportDay, retainedSince, shiftReportDay, type ReportPeriod } from './report-period';

export const BUILD_ORDER_SUMMARY = 'build-order-summary';

@Injectable()
export class AnalyticsSummariesService {
  constructor(
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ContactStatsService) private readonly contactStats: ContactStatsService,
    @Inject(OrderReportingService) private readonly orders: OrderReportingService,
    @Inject(AnalyticsRepository) private readonly summaries: AnalyticsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.sync) private readonly queue: Queue,
  ) {}

  async refreshOrder(storeId: string, orderId: string, event: { id: string; occurredAt: string }) {
    if (await this.summaries.hasOrderEvent(storeId, event)) return;
    const now = this.clock.now();
    const timeZone = await this.stores.timeZone(storeId);
    const order = await this.orders.reportingAnchor(storeId, orderId, timeZone, now);
    if (!order) return;
    // The minute job must exist before we record the event as handled.
    if (order.retained) await this.scheduleOrderDay(storeId, order.day);
    await this.transaction.run(storeId, async () => {
      if (!(await this.summaries.recordEvent(storeId, event, now))) return;
      const { buyerContactId } = order;
      if (buyerContactId) {
        await this.summaries.lockSummaries(storeId, buyerContactId);
        await this.refreshBuyer(storeId, buyerContactId, timeZone, this.clock.now());
      }
    });
  }

  async refreshOrderDays(storeId: string, period: ReportPeriod) {
    await this.transaction.run(storeId, async () => {
      await this.summaries.lockSummaries(storeId, 'orders');
      const timeZone = await this.stores.timeZone(storeId);
      const now = this.clock.now();
      const cutoff = retainedSince(reportDay(now, timeZone));
      const from = period.from < cutoff ? cutoff : period.from;
      if (from > period.through) return;
      const rows = await this.orders.dailyOrderMetrics(storeId, { ...period, from, timeZone });
      const byDay = new Map(rows.map((row) => [row.day, row]));
      const metrics = [];
      for (let day = from; day <= period.through; day = shiftReportDay(day, 1)) {
        const totals = byDay.get(day) ?? { orders: '0', deliveredOrders: '0', netSpend: '0' };
        metrics.push(
          { day, metric: 'orders', value: BigInt(totals.orders) },
          { day, metric: 'delivered_orders', value: BigInt(totals.deliveredOrders) },
          { day, metric: 'net_spend', value: BigInt(totals.netSpend) },
        );
      }
      await this.summaries.save(storeId, metrics, now);
    });
  }

  private async scheduleOrderDay(storeId: string, day: string) {
    const now = this.clock.now().getTime();
    const dueAt = (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS;
    await this.queue.add(
      BUILD_ORDER_SUMMARY,
      { storeId, day },
      {
        deduplication: { id: `${BUILD_ORDER_SUMMARY}-${storeId}-${day}`, keepLastIfActive: true },
        delay: dueAt - now,
        attempts: 3,
        backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
        removeOnComplete: { age: DAY_MS / 1000 },
        removeOnFail: { age: (7 * DAY_MS) / 1000 },
      },
    );
  }

  async refreshLifecycle(storeId: string) {
    await this.transaction.run(storeId, async () => {
      await this.summaries.lockSummaries(storeId, 'lifecycle');
      const now = this.clock.now();
      const timeZone = await this.stores.timeZone(storeId);
      const day = reportDay(now, timeZone);
      const rows = await this.contactStats.lifecycleCounts(storeId);
      const counts = new Map(rows.map(({ stage, count }) => [stage, count]));
      const metrics = lifecycleStages
        .filter((stage) => stage !== 'none')
        .map((stage) => ({
          day,
          metric: 'lifecycle',
          dimension: stage,
          value: BigInt(counts.get(stage) ?? 0),
        }));
      await this.summaries.save(storeId, metrics, now);
    });
  }

  private async refreshBuyer(storeId: string, contactId: string, timeZone: string, now: Date) {
    const buyer = await this.contacts.findRecipient(storeId, contactId);
    const days =
      buyer && !buyer.isBlocked && buyer.kind !== 'not_customer'
        ? await this.orders.buyerActivityDays(storeId, contactId, timeZone, now)
        : [];
    await this.summaries.replaceBuyerActivity(storeId, contactId, days, now);
  }
}
