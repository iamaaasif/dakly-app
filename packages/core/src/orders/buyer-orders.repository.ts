import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { orderItems, orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

const columns = {
  id: orders.id,
  number: orders.number,
  stage: orders.stage,
  paymentStatus: orders.paymentStatus,
  itemsSubtotalPoisha: orders.itemsSubtotalPoisha,
  orderDiscountPoisha: orders.orderDiscountPoisha,
  deliveryChargePoisha: orders.deliveryChargePoisha,
  deliveredItemsSubtotalPoisha: orders.deliveredItemsSubtotalPoisha,
  deliveredOrderDiscountPoisha: orders.deliveredOrderDiscountPoisha,
  courier: orders.courier,
  trackingCode: orders.trackingCode,
  createdAt: orders.createdAt,
};

@Injectable()
export class BuyerOrdersRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, contactId: string, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.buyerContactId, contactId)))
        .orderBy(desc(orders.number))
        .limit(limit),
    );
  }

  async find(storeId: string, contactId: string, number: number) {
    const [order] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.buyerContactId, contactId),
            eq(orders.number, number),
          ),
        ),
    );
    return order;
  }

  items(storeId: string, orderId: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          productName: orderItems.productName,
          variantTitle: orderItems.variantTitle,
          quantity: orderItems.quantity,
          unitPricePoisha: orderItems.unitPricePoisha,
        })
        .from(orderItems)
        .where(and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orderId)))
        .orderBy(orderItems.variantId, orderItems.id),
    );
  }
}
