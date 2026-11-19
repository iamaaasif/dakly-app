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

  buyerActivityDays(storeId: string, contactId: string, timeZone: string, now: Date) {
    return this.orders.buyerActivityDays(storeId, contactId, timeZone, now);
  }

  countCreatedOrders(storeId: string, day: string, timeZone: string) {
    return this.orders.countCreatedOrders(storeId, day, timeZone);
  }
}
