import { Inject, Injectable } from '@nestjs/common';

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
        await this.writeOrderCounts(storeId, { from: day, through: day }, timeZone, now);
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

  async finishReconciliation(storeId: string) {
    const day = this.clock.now().toISOString().slice(0, 10);
    await this.summaries.pruneEventMarkers(storeId, shiftReportDay(day, -7));
  }

  async reconcileOrderRange(storeId: string, period: ReportPeriod) {
    await this.transaction.run(storeId, async () => {
      await this.summaries.lockSummaries(storeId);
      const timeZone = await this.stores.timeZone(storeId);
      await this.writeOrderCounts(storeId, period, timeZone, this.clock.now());
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

  private async writeOrderCounts(
    storeId: string,
    period: ReportPeriod,
    timeZone: string,
    now: Date,
  ) {
    const orders = await this.orders.orderCountsForRange(storeId, { ...period, timeZone });
    const former = await this.summaries.readDailyMetric(storeId, period, 'orders');
    const counts = new Map(former.map(({ day }) => [day, 0n]));
    for (const { day, count } of orders) counts.set(day, BigInt(count));
    const metrics = Array.from(counts, ([day, value]) => ({ day, metric: 'orders', value }));
    if (metrics.length) await this.summaries.save(storeId, metrics, now);
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
