import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { orderItems, orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';
import { orderMatchingConditions, type OrderMatch } from './order-filters.repository';

export type OrderExportRow = Awaited<ReturnType<OrderExportRepository['listLines']>>[number];

@Injectable()
export class OrderExportRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  listLines(storeId: string, filter: OrderMatch, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          number: orders.number,
          createdAt: orders.createdAt,
          stage: orders.stage,
          buyerName: orders.buyerName,
          recipientName: orders.recipientName,
          recipientPhone: orders.recipientPhone,
          district: orders.recipientDistrict,
          productName: orderItems.productName,
          variantTitle: orderItems.variantTitle,
          quantity: orderItems.quantity,
          unitPricePoisha: orderItems.unitPricePoisha,
          lineDiscountPoisha: orderItems.lineDiscountPoisha,
          deliveryChargePoisha: orders.deliveryChargePoisha,
          orderDiscountPoisha: orders.orderDiscountPoisha,
          advancePaidPoisha: orders.advancePaidPoisha,
          codAmountPoisha: orders.codAmountPoisha,
        })
        .from(orders)
        .innerJoin(
          orderItems,
          and(eq(orderItems.storeId, orders.storeId), eq(orderItems.orderId, orders.id)),
        )
        .where(orderMatchingConditions(tx, storeId, filter))
        .orderBy(desc(orders.number), orderItems.createdAt, orderItems.id)
        .limit(limit),
    );
  }
}
