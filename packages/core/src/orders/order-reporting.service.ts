import { Inject, Injectable } from '@nestjs/common';

import { OrderReportingRepository } from './order-reporting.repository';

@Injectable()
export class OrderReportingService {
  constructor(
    @Inject(OrderReportingRepository) private readonly orders: OrderReportingRepository,
  ) {}

  contactOrderTotals(storeId: string, contactId: string, timeZone: string) {
    return this.orders.contactOrderTotals(storeId, contactId, timeZone);
  }

  buyerContactId(storeId: string, orderId: string) {
    return this.orders.buyerContactId(storeId, orderId);
  }

  reportingAnchor(storeId: string, orderId: string, timeZone: string) {
    return this.orders.reportingAnchor(storeId, orderId, timeZone);
  }

  reportBuyerIds(
    storeId: string,
    after: string | null,
    range: { timeZone: string; since: string; limit: number },
  ) {
    return this.orders.reportBuyerIds(storeId, after, range);
  }

  oldestRetainedOrderDay(storeId: string, timeZone: string, since: string) {
    return this.orders.oldestRetainedOrderDay(storeId, timeZone, since);
  }

  buyerActivityDays(storeId: string, contactId: string, timeZone: string, since: string) {
    return this.orders.buyerActivityDays(storeId, contactId, timeZone, since);
  }

  reportingDays(storeId: string, orderIds: string[], timeZone: string) {
    return this.orders.reportingDays(storeId, orderIds, timeZone);
  }

  dailyAttributionMetrics(
    storeId: string,
    range: { from: string; through: string; timeZone: string },
  ) {
    return this.orders.dailyAttributionMetrics(storeId, range);
  }

  dailyOrderMetrics(storeId: string, range: { from: string; through: string; timeZone: string }) {
    return this.orders.dailyOrderMetrics(storeId, range);
  }
}
