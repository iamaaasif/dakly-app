import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  type SQL,
  gte,
  ilike,
  inArray,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import type { OrderListQuery, OrderStage } from '@dakly/contracts/orders';
import { orderItems, orders } from '@dakly/db/schema/orders';

import type { Transaction } from '../platform/database/scoped-transactions';
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
  codCollectedPoisha: orders.codCollectedPoisha,
  deliveredItemsSubtotalPoisha: orders.deliveredItemsSubtotalPoisha,
  deliveredOrderDiscountPoisha: orders.deliveredOrderDiscountPoisha,
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

type OrderFilters = Omit<OrderListQuery, 'stage'> & {
  stages?: OrderStage[];
  timeZone: string | null;
};

@Injectable()
export class OrdersRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, query: OrderFilters, overdueBefore: Date, phone?: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ ...summaryColumns, itemPreview })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            query.stages ? inArray(orders.stage, query.stages) : undefined,
            query.cursor ? lt(orders.number, query.cursor) : undefined,
            orderSearch(query.search, phone),
            orderFilters(query),
            query.alert ? orderAlertFilter(tx, storeId, query.alert, overdueBefore) : undefined,
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

  async hasItemsInStages(
    storeId: string,
    variantIds: string[],
    stages: OrderStage[],
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .innerJoin(orders, and(eq(orders.storeId, storeId), eq(orders.id, orderItems.orderId)))
        .where(
          and(
            eq(orderItems.storeId, storeId),
            inArray(orderItems.variantId, variantIds),
            inArray(orders.stage, stages),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  }

  async alertTotals(storeId: string, overdueBefore: Date) {
    const [row] = await this.database.forStore(storeId, (tx) => {
      const waiting = orderAlertFilter(tx, storeId, 'waiting', overdueBefore);
      const risk = orderAlertFilter(tx, storeId, 'risk', overdueBefore);
      const cod = orderAlertFilter(tx, storeId, 'cod', overdueBefore);
      return tx
        .select({
          waiting: sql<number>`count(*) filter (where ${waiting})`.mapWith(Number),
          highRisk: sql<number>`count(*) filter (where ${risk})`.mapWith(Number),
          codAwaitingOrders: sql<number>`count(*) filter (where ${cod})`.mapWith(Number),
          codAwaitingPoisha: sql<string>`coalesce(sum(${orders.codAmountPoisha}) filter (where ${cod}), 0)::text`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.stage, ['to_confirm', 'delivered', 'partially_delivered']),
          ),
        );
    });
    return row ?? { waiting: 0, highRisk: 0, codAwaitingOrders: 0, codAwaitingPoisha: '0' };
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
          and(eq(orders.storeId, storeId), inArray(orders.recipientPhone, phones), parcelOutcome),
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

const itemPreview = sql<string | null>`(
  select string_agg(label, ', ' order by id)
  from (
    select item.id, item.product_name || case when item.variant_title = 'Default' then ''
      else ' (' || item.variant_title || ')' end || ' × ' || item.quantity::text as label
    from ${orderItems} item
    where item.store_id = "orders"."store_id" and item.order_id = "orders"."id"
    order by item.id limit 2
  ) lines
)`;

const parcelOutcome = sql`${orders.stage} in ('delivered', 'partially_delivered', 'returned')`;

function orderFilters({ source, courier, createdFrom, createdThrough, timeZone }: OrderFilters) {
  return and(
    source ? eq(orders.source, source) : undefined,
    courier ? eq(orders.courier, courier) : undefined,
    createdFrom
      ? sql`${orders.createdAt} >= ${createdFrom}::date::timestamp at time zone ${timeZone}`
      : undefined,
    createdThrough
      ? sql`${orders.createdAt} < (${createdThrough}::date + 1)::timestamp at time zone ${timeZone}`
      : undefined,
  );
}

function orderSearch(search?: string, phone?: string) {
  if (!search) return;
  if (phone) return eq(orders.recipientPhone, phone);
  if (/^#?\d{1,10}$/.test(search)) {
    const number = Number(search.replace('#', ''));
    if (number <= 2147483647) return eq(orders.number, number);
  }
  const name = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
  return or(ilike(orders.buyerName, name), ilike(orders.recipientName, name));
}

function orderAlertFilter(
  tx: Transaction,
  storeId: string,
  alert: NonNullable<OrderListQuery['alert']>,
  overdueBefore: Date,
): SQL {
  if (alert === 'waiting')
    return sql`${orders.stage} = 'to_confirm' and ${lt(orders.createdAt, overdueBefore)}`;
  if (alert === 'cod')
    return sql`${orders.stage} in ('delivered', 'partially_delivered')
      and ${orders.paymentStatus} in ('cod_pending', 'advance_paid') and ${orders.codAmountPoisha} > 0`;
  const riskPhones = tx
    .select({ phone: orders.recipientPhone })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), parcelOutcome))
    .groupBy(orders.recipientPhone)
    .having(
      sql`count(*) >= 2 and 2 * count(*) filter (where ${orders.stage} = 'returned') >= count(*)`,
    );
  return sql`${orders.stage} = 'to_confirm' and ${orders.advancePaidPoisha} = 0
    and ${inArray(orders.recipientPhone, riskPhones)}`;
}
