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
}
