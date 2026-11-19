import { Inject, Injectable } from '@nestjs/common';

import { OrderReportingRepository } from './order-reporting.repository';

@Injectable()
export class OrderReportingService {
  constructor(
    @Inject(OrderReportingRepository) private readonly orders: OrderReportingRepository,
  ) {}

  reportingAnchor(storeId: string, orderId: string, timeZone: string, now: Date) {
    return this.orders.reportingAnchor(storeId, orderId, timeZone, now);
  }

  reportBuyerIds(
    storeId: string,
    after: string | null,
    range: { timeZone: string; now: Date; limit: number },
  ) {
    return this.orders.reportBuyerIds(storeId, after, range);
  }

  buyerActivityDays(storeId: string, contactId: string, timeZone: string, now: Date) {
    return this.orders.buyerActivityDays(storeId, contactId, timeZone, now);
  }

  oldestRetainedOrderDay(storeId: string, timeZone: string, now: Date) {
    return this.orders.oldestRetainedOrderDay(storeId, timeZone, now);
  }

  orderCountsForRange(storeId: string, range: { from: string; through: string; timeZone: string }) {
    return this.orders.orderCountsForRange(storeId, range);
  }
}
