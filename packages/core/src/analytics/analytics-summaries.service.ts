import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { orderSources } from '@dakly/contracts/orders';

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
const ORDER_TOTALS = ['orders', 'delivered_orders', 'net_spend'] as const;

@Injectable()
export class AnalyticsSummariesService {
  constructor(
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(OrderReportingService) private readonly orders: OrderReportingService,
    @Inject(AnalyticsRepository) private readonly summaries: AnalyticsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.sync) private readonly queue: Queue,
  ) {}

  async refreshOrder(storeId: string, orderId: string) {
    const timeZone = await this.stores.timeZone(storeId);
    const order = await this.orders.reportingAnchor(storeId, orderId, timeZone);
    if (!order) return;
    const { day, buyerContactId } = order;
    if (buyerContactId) {
      await this.transaction.run(storeId, async () => {
        await this.summaries.lockSummaries(storeId, buyerContactId);
        await this.refreshBuyer(storeId, buyerContactId, timeZone);
      });
    }
    await this.scheduleOrderDay(storeId, day);
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
      const metrics = [];
      for (let day = from; day <= period.through; day = shiftReportDay(day, 1)) {
        const totals = rows.filter((row) => row.day === day);
        const sales = new Map(totals.map((row) => [row.source, row.sales]));
        metrics.push(
          ...ORDER_TOTALS.map((metric) => ({
            day,
            metric,
            value: totals.reduce((sum, row) => sum + BigInt(row[metric]), 0n),
          })),
          ...orderSources.map((source) => ({
            day,
            metric: 'sales',
            dimension: source,
            value: BigInt(sales.get(source) ?? 0),
          })),
        );
      }
      await this.summaries.save(storeId, metrics, now);
    });
  }

  private async scheduleOrderDay(storeId: string, day: string) {
    await this.queue.add(
      BUILD_ORDER_SUMMARY,
      { storeId, day },
      {
        deduplication: { id: `${BUILD_ORDER_SUMMARY}-${storeId}-${day}`, keepLastIfActive: true },
        delay: MINUTE_MS - (this.clock.now().getTime() % MINUTE_MS),
        attempts: 3,
        backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
        removeOnComplete: { age: DAY_MS / 1000 },
        removeOnFail: 100,
      },
    );
  }

  private async refreshBuyer(storeId: string, contactId: string, timeZone: string) {
    const now = this.clock.now();
    const since = retainedSince(reportDay(now, timeZone));
    const buyer = await this.contacts.findRecipient(storeId, contactId);
    const days =
      buyer && !buyer.isBlocked && buyer.kind !== 'not_customer'
        ? await this.orders.buyerActivityDays(storeId, contactId, timeZone, since)
        : [];
    await this.summaries.replaceBuyerActivity(storeId, contactId, days, now);
  }
}
