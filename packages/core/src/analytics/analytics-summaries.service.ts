import { Inject, Injectable } from '@nestjs/common';

import { lifecycleStages } from '@dakly/contracts/contacts';

import { ContactStatsService } from '../contacts/contact-stats.service';
import { ContactsService } from '../contacts/contacts.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { AnalyticsRepository } from './analytics.repository';
import { reportDay, shiftReportDay, type ReportPeriod } from './report-period';

const BUYER_PAGE_SIZE = 100;

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
  ) {}

  async refreshOrder(storeId: string, orderId: string, event: { id: string; occurredAt: string }) {
    await this.transaction.run(storeId, async () => {
      await this.summaries.lockSummaries(storeId);
      const now = this.clock.now();
      if (!(await this.summaries.recordEvent(storeId, event, now))) return;
      const timeZone = await this.stores.timeZone(storeId);
      const order = await this.orders.reportingAnchor(storeId, orderId, timeZone, now);
      if (!order) return;
      const { day, buyerContactId } = order;
      if (order.retained) {
        await this.writeOrderMetrics(storeId, { from: day, through: day }, timeZone, now);
      }
      if (buyerContactId) await this.refreshBuyer(storeId, buyerContactId, timeZone, now);
    });
  }

  async reconciliationRange(storeId: string): Promise<ReportPeriod> {
    const now = this.clock.now();
    const timeZone = await this.stores.timeZone(storeId);
    const through = reportDay(now, timeZone);
    const [firstOrder, firstSummary] = await Promise.all([
      this.orders.oldestRetainedOrderDay(storeId, timeZone, now),
      this.summaries.oldestOrderSummaryDay(storeId, through),
    ]);
    const [from] = [firstOrder ?? through, firstSummary ?? through].sort();
    return { from: from ?? through, through };
  }

  async pruneExpiredRows(storeId: string) {
    const now = this.clock.now();
    const timeZone = await this.stores.timeZone(storeId);
    return this.summaries.pruneExpiredRows(storeId, {
      eventBefore: shiftReportDay(now.toISOString().slice(0, 10), -7),
      storeDay: reportDay(now, timeZone),
    });
  }

  async reconcileOrderRange(storeId: string, period: ReportPeriod) {
    await this.transaction.run(storeId, async () => {
      await this.summaries.lockSummaries(storeId);
      const timeZone = await this.stores.timeZone(storeId);
      await this.writeOrderMetrics(storeId, period, timeZone, this.clock.now());
    });
  }

  async reconcileBuyerPage(storeId: string, after: string | null) {
    const timeZone = await this.stores.timeZone(storeId);
    const now = this.clock.now();
    const [current, summarized] = await Promise.all([
      this.orders.reportBuyerIds(storeId, after, { timeZone, now, limit: BUYER_PAGE_SIZE }),
      this.summaries.reportedBuyerIds(storeId, after, BUYER_PAGE_SIZE),
    ]);
    const ids = Array.from(new Set([...current, ...summarized]))
      .sort()
      .slice(0, BUYER_PAGE_SIZE);
    for (const id of ids) {
      await this.transaction.run(storeId, async () => {
        await this.summaries.lockSummaries(storeId);
        await this.refreshBuyer(storeId, id, timeZone, now);
      });
    }
    return ids.length === BUYER_PAGE_SIZE ? (ids.at(-1) ?? null) : null;
  }

  private async writeOrderMetrics(
    storeId: string,
    period: ReportPeriod,
    timeZone: string,
    now: Date,
  ) {
    const rows = await this.orders.dailyOrderMetrics(storeId, { ...period, timeZone });
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const metrics = [];
    for (let day = period.from; day <= period.through; day = shiftReportDay(day, 1)) {
      const totals = byDay.get(day);
      metrics.push(
        { day, metric: 'orders', value: BigInt(totals?.orders ?? 0) },
        { day, metric: 'delivered_orders', value: BigInt(totals?.deliveredOrders ?? 0) },
        { day, metric: 'net_spend', value: BigInt(totals?.netSpend ?? 0) },
      );
    }
    await this.summaries.save(storeId, metrics, now);
  }

  async refreshLifecycle(storeId: string) {
    await this.transaction.run(storeId, async () => {
      await this.summaries.lockSummaries(storeId);
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
