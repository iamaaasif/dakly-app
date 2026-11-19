import { Inject, Injectable } from '@nestjs/common';

import { ContactsService } from '../contacts/contacts.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { AnalyticsRepository } from './analytics.repository';

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
        const count = await this.orders.countCreatedOrders(storeId, day, timeZone);
        await this.summaries.save(storeId, [{ day, metric: 'orders', value: BigInt(count) }], now);
      }
      if (buyerContactId) await this.refreshBuyer(storeId, buyerContactId, timeZone, now);
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
