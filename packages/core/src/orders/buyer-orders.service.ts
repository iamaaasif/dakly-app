import { Inject, Injectable } from '@nestjs/common';

import { BuyerOrdersRepository } from './buyer-orders.repository';
import { orderTotalPoisha } from './order-totals';
import { orderError } from './orders.errors';

// A buyer sees only their own orders. There is no lookup by phone or by order number alone.
@Injectable()
export class BuyerOrdersService {
  constructor(@Inject(BuyerOrdersRepository) private readonly repository: BuyerOrdersRepository) {}

  async list(storeId: string, contactId: string, limit: number) {
    const rows = await this.repository.list(storeId, contactId, limit);
    return rows.map((row) => ({
      number: row.number,
      stage: row.stage,
      totalPoisha: orderTotalPoisha(row),
      createdAt: row.createdAt,
    }));
  }

  async get(storeId: string, contactId: string, number: number) {
    const order = await this.repository.find(storeId, contactId, number);
    if (!order) throw orderError('ORDER_NOT_FOUND');
    return {
      number: order.number,
      stage: order.stage,
      paymentStatus: order.paymentStatus,
      totalPoisha: orderTotalPoisha(order),
      courier: order.courier,
      trackingCode: order.trackingCode,
      items: await this.repository.items(storeId, order.id),
    };
  }
}
