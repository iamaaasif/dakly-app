import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { orderItems, orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderShippingLabelsRepository {
  constructor(@Inject(TenantDatabase) private readonly tenant: TenantDatabase) {}

  find(storeId: string, orderIds: string[]) {
    return this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          id: orders.id,
          number: orders.number,
          recipientName: orders.recipientName,
          recipientPhone: orders.recipientPhone,
          recipientAddress: orders.recipientAddress,
          recipientDistrict: orders.recipientDistrict,
          codAmountPoisha: orders.codAmountPoisha,
          paymentStatus: orders.paymentStatus,
          itemCount:
            sql<number>`coalesce(sum(coalesce(${orderItems.deliveredQuantity}, ${orderItems.quantity})), 0)`.mapWith(
              Number,
            ),
        })
        .from(orders)
        .leftJoin(
          orderItems,
          and(eq(orderItems.orderId, orders.id), eq(orderItems.storeId, storeId)),
        )
        .where(and(eq(orders.storeId, storeId), inArray(orders.id, orderIds)))
        .groupBy(orders.id),
    );
  }
}
