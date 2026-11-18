import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, lt } from 'drizzle-orm';

import type { OrderListQuery } from '@dakly/contracts/orders';
import { orderItems, orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

const summaryColumns = {
  id: orders.id,
  number: orders.number,
  buyerName: orders.buyerName,
  recipientName: orders.recipientName,
  stage: orders.stage,
  source: orders.source,
  paymentStatus: orders.paymentStatus,
  itemsSubtotalPoisha: orders.itemsSubtotalPoisha,
  orderDiscountPoisha: orders.orderDiscountPoisha,
  deliveryChargePoisha: orders.deliveryChargePoisha,
  advancePaidPoisha: orders.advancePaidPoisha,
  codAmountPoisha: orders.codAmountPoisha,
  createdAt: orders.createdAt,
};

const detailColumns = {
  ...summaryColumns,
  buyerContactId: orders.buyerContactId,
  isRecipientBuyer: orders.isRecipientBuyer,
  recipientPhone: orders.recipientPhone,
  recipientAddress: orders.recipientAddress,
  recipientDistrict: orders.recipientDistrict,
  recipientBdAreaId: orders.recipientBdAreaId,
  isDeliveryChargeOverridden: orders.isDeliveryChargeOverridden,
  onHoldReason: orders.onHoldReason,
  followUpOn: orders.followUpOn,
  cancelReason: orders.cancelReason,
};

export type StageWrite = Pick<
  typeof orders.$inferInsert,
  | 'stage'
  | 'onHoldReason'
  | 'followUpOn'
  | 'cancelReason'
  | 'confirmationMethod'
  | 'confirmedAt'
  | 'cancelledAt'
  | 'updatedAt'
>;

@Injectable()
export class OrdersRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, query: OrderListQuery) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(summaryColumns)
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            query.stage === undefined ? undefined : eq(orders.stage, query.stage),
            query.cursor === undefined ? undefined : lt(orders.number, query.cursor),
          ),
        )
        .orderBy(desc(orders.number))
        .limit(query.limit + 1),
    );
  }

  countByStage(storeId: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ stage: orders.stage, count: count() })
        .from(orders)
        .where(eq(orders.storeId, storeId))
        .groupBy(orders.stage),
    );
  }

  async find(storeId: string, orderId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(detailColumns)
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
        .limit(1),
    );
    return row;
  }

  items(storeId: string, orderId: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: orderItems.id,
          variantId: orderItems.variantId,
          productName: orderItems.productName,
          variantTitle: orderItems.variantTitle,
          quantity: orderItems.quantity,
          deliveredQuantity: orderItems.deliveredQuantity,
          isStockTracked: orderItems.isStockTracked,
          unitPricePoisha: orderItems.unitPricePoisha,
          lineDiscountPoisha: orderItems.lineDiscountPoisha,
        })
        .from(orderItems)
        .where(and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orderId)))
        .orderBy(orderItems.variantId, orderItems.id),
    );
  }

  async lock(storeId: string, orderId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          stage: orders.stage,
          confirmedAt: orders.confirmedAt,
          source: orders.source,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
        .for('update'),
    );
    return row;
  }

  async setStage(storeId: string, orderId: string, values: StageWrite): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(orders)
        .set(values)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId))),
    );
  }
}
