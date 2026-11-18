import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, ne, notInArray, sql } from 'drizzle-orm';

import type { OrderListQuery } from '@dakly/contracts/orders';
import { orderItems, orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

const summaryColumns = {
  id: orders.id,
  number: orders.number,
  buyerName: orders.buyerName,
  recipientName: orders.recipientName,
  recipientPhone: orders.recipientPhone,
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
  recipientAddress: orders.recipientAddress,
  recipientDistrict: orders.recipientDistrict,
  recipientBdAreaId: orders.recipientBdAreaId,
  isDeliveryChargeOverridden: orders.isDeliveryChargeOverridden,
  onHoldReason: orders.onHoldReason,
  followUpOn: orders.followUpOn,
  cancelReason: orders.cancelReason,
  courier: orders.courier,
  courierOtherName: orders.courierOtherName,
  trackingCode: orders.trackingCode,
  shippedAt: orders.shippedAt,
  shippedByUserId: orders.shippedByUserId,
  deliveredAt: orders.deliveredAt,
  returnedAt: orders.returnedAt,
  returnReason: orders.returnReason,
  codCollectedAt: orders.codCollectedAt,
  codCollectedPoisha: orders.codCollectedPoisha,
  deliveredItemsSubtotalPoisha: orders.deliveredItemsSubtotalPoisha,
  deliveredOrderDiscountPoisha: orders.deliveredOrderDiscountPoisha,
  possibleDuplicateOfOrderId: orders.possibleDuplicateOfOrderId,
};

export type OrderWrite = Omit<typeof orders.$inferInsert, 'storeId'>;
export type OrderItemWrite = Omit<typeof orderItems.$inferInsert, 'storeId' | 'orderId'>;

export type StageWrite = Partial<
  Pick<
    typeof orders.$inferInsert,
    | 'stage'
    | 'onHoldReason'
    | 'followUpOn'
    | 'cancelReason'
    | 'confirmationMethod'
    | 'confirmedAt'
    | 'cancelledAt'
    | 'courier'
    | 'courierOtherName'
    | 'trackingCode'
    | 'shippedAt'
    | 'shippedByUserId'
    | 'deliveredAt'
    | 'returnedAt'
    | 'returnReason'
    | 'paymentStatus'
    | 'deliveredItemsSubtotalPoisha'
    | 'deliveredOrderDiscountPoisha'
    | 'codAmountPoisha'
    | 'updatedAt'
  >
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

  parcelOutcomes(storeId: string, phones: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          phone: orders.recipientPhone,
          parcels: count(),
          returned: sql<number>`count(*) filter (where ${orders.stage} = 'returned')`.mapWith(
            Number,
          ),
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.recipientPhone, phones),
            inArray(orders.stage, ['delivered', 'partially_delivered', 'returned']),
          ),
        )
        .groupBy(orders.recipientPhone),
    );
  }

  async findByIdempotencyKey(storeId: string, key: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.idempotencyKey, key)))
        .limit(1),
    );
    return row;
  }

  async findDuplicate(
    storeId: string,
    {
      orderId,
      phone,
      variantIds,
      since,
    }: { orderId: string; phone: string; variantIds: string[]; since: Date },
  ) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: orders.id })
        .from(orders)
        .innerJoin(
          orderItems,
          and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orders.id)),
        )
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.recipientPhone, phone),
            inArray(orderItems.variantId, variantIds),
            gte(orders.createdAt, since),
            ne(orders.id, orderId),
          ),
        )
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(1),
    );
    return row?.id ?? null;
  }

  async insert(storeId: string, order: OrderWrite): Promise<void> {
    await this.database.forStore(storeId, (tx) => tx.insert(orders).values({ ...order, storeId }));
  }

  async insertItems(storeId: string, orderId: string, items: OrderItemWrite[]): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(orderItems).values(items.map((item) => ({ ...item, orderId, storeId }))),
    );
  }

  async saveItems(storeId: string, orderId: string, items: OrderItemWrite[]): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      await tx.delete(orderItems).where(
        and(
          eq(orderItems.storeId, storeId),
          eq(orderItems.orderId, orderId),
          notInArray(
            orderItems.id,
            items.flatMap(({ id }) => (id ? [id] : [])),
          ),
        ),
      );
      await tx
        .insert(orderItems)
        .values(items.map((item) => ({ ...item, storeId, orderId })))
        .onConflictDoUpdate({
          target: orderItems.id,
          set: {
            quantity: sql`excluded.quantity`,
            lineDiscountPoisha: sql`excluded.line_discount_poisha`,
          },
          setWhere: and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orderId)),
        });
    });
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
          deliveredLineDiscountPoisha: orderItems.deliveredLineDiscountPoisha,
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
          ...detailColumns,
          confirmedAt: orders.confirmedAt,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
        // Allow foreign-key checks from other orders while serializing this order's writes.
        .for('no key update'),
    );
    return row;
  }

  async recordDelivery(
    storeId: string,
    orderId: string,
    lines: { itemId: string; quantity: number; discountPoisha?: number }[],
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.execute(sql`
        update ${orderItems} as item
        set delivered_quantity = delivery.quantity, delivered_line_discount_poisha = delivery."discountPoisha"
        from jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) as delivery("itemId" uuid, quantity integer, "discountPoisha" bigint)
        where item.store_id = ${storeId} and item.order_id = ${orderId} and item.id = delivery."itemId"
      `),
    );
  }

  async updateOrder(storeId: string, orderId: string, values: Partial<OrderWrite>): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(orders)
        .set(values)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId))),
    );
  }
}
