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

  buyerActivityDays(storeId: string, contactId: string, timeZone: string, since: string) {
    return this.orders.buyerActivityDays(storeId, contactId, timeZone, since);
  }

  dailyOrderMetrics(storeId: string, range: { from: string; through: string; timeZone: string }) {
    return this.orders.dailyOrderMetrics(storeId, range);
  }
}
