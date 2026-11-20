import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNotNull, ne, sql } from 'drizzle-orm';

import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

const DELIVERED = sql`stage in ('delivered', 'partially_delivered')`;
const NET_SPEND = sql<string>`coalesce(sum(coalesce(delivered_items_subtotal_poisha, items_subtotal_poisha)
  - coalesce(delivered_order_discount_poisha, order_discount_poisha)) filter (
  where ${DELIVERED} and (
    payment_status = 'paid'
    or (payment_status = 'advance_paid' and cod_amount_poisha = 0)
    or (payment_status = 'cod_collected' and cod_collected_poisha >= cod_amount_poisha)
  )), 0)::text`;

@Injectable()
export class OrderReportingRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async reportingAnchor(storeId: string, orderId: string, timeZone: string) {
    const [order] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          day: sql<string>`(${orders.createdAt} at time zone ${timeZone})::date::text`,
          buyerContactId: orders.buyerContactId,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId))),
    );
    return order;
  }

  async reportBuyerIds(
    storeId: string,
    after: string | null,
    { timeZone, since, limit }: { timeZone: string; since: string; limit: number },
  ) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinct({ id: sql<string>`${orders.buyerContactId}` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            isNotNull(orders.buyerContactId),
            after ? gt(orders.buyerContactId, after) : undefined,
            ne(orders.stage, 'cancelled'),
            retainedOrders(since, timeZone),
          ),
        )
        .orderBy(asc(orders.buyerContactId))
        .limit(limit),
    );
    return rows.map(({ id }) => id);
  }

  async oldestRetainedOrderDay(storeId: string, timeZone: string, since: string) {
    const [order] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ day: sql<string>`(${orders.createdAt} at time zone ${timeZone})::date::text` })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), retainedOrders(since, timeZone)))
        .orderBy(asc(orders.createdAt))
        .limit(1),
    );
    return order?.day;
  }

  async buyerActivityDays(storeId: string, contactId: string, timeZone: string, since: string) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ day: string; firstDay: number }>(sql`
        with first_order as (
          select (created_at at time zone ${timeZone})::date - date '1970-01-01' as day
          from orders where store_id = ${storeId} and buyer_contact_id = ${contactId}
            and stage <> 'cancelled'
          order by created_at limit 1
        )
        select distinct (o.created_at at time zone ${timeZone})::date::text as day,
          first_order.day as "firstDay"
        from orders o cross join first_order
        where o.store_id = ${storeId} and o.buyer_contact_id = ${contactId}
          and o.stage <> 'cancelled'
          and o.created_at >= (${since}::date - 1)::timestamp at time zone 'UTC'
          and (o.created_at at time zone ${timeZone})::date >= ${since}::date
      `),
    );
    return rows;
  }

  dailyOrderMetrics(storeId: string, range: { from: string; through: string; timeZone: string }) {
    const { from, through, timeZone } = range;
    const day = sql`(${orders.createdAt} at time zone ${timeZone})::date`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          day: sql<string>`${day}::text`,
          source: orders.source,
          orders: sql<string>`count(*)::text`,
          sales: sql<string>`sum(${orders.itemsSubtotalPoisha} - ${orders.orderDiscountPoisha})::text`,
          delivered_orders: sql<string>`count(*) filter (where ${DELIVERED})::text`,
          net_spend: NET_SPEND,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            ne(orders.stage, 'cancelled'),
            // The UTC bounds keep the index usable when local midnight repeats.
            sql`${orders.createdAt} >= (${from}::date - 1)::timestamp at time zone 'UTC' and ${orders.createdAt} < (${through}::date + 2)::timestamp at time zone 'UTC'`,
            sql`${day} between ${from}::date and ${through}::date`,
          ),
        )
        .groupBy(sql`1`, orders.source),
    );
  }

  dailyAttributionMetrics(
    storeId: string,
    {
      from,
      through,
      timeZone,
    }: {
      from: string;
      through: string;
      timeZone: string;
    },
  ) {
    const day = sql`(${orders.createdAt} at time zone ${timeZone})::date`;
    const dimension = sql<string>`coalesce(${orders.attributedSourceType} || ':' || ${orders.attributedSourceId}::text, '')`;
    const captured = sql`coalesce(${orders.attributedAmountPoisha}, 0)`;
    const current = sql`(${orders.itemsSubtotalPoisha} - ${orders.orderDiscountPoisha})`;
    const kept = sql`(coalesce(${orders.deliveredItemsSubtotalPoisha}, ${orders.itemsSubtotalPoisha})
      - coalesce(${orders.deliveredOrderDiscountPoisha}, ${orders.orderDiscountPoisha}))`;
    const net = sql`case
      when ${orders.stage} = 'returned' then 0
      when ${orders.stage} = 'partially_delivered' then greatest(0, ${captured} - (${current} - ${kept}))
      else ${captured} end`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          day: sql<string>`${day}::text`,
          dimension,
          marketing_orders: sql<string>`count(*)::text`,
          marketing_revenue: sql<string>`sum(${net})::text`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            ne(orders.stage, 'cancelled'),
            isNotNull(orders.attributedSourceType),
            isNotNull(orders.attributedSourceId),
            sql`${orders.createdAt} >= (${from}::date - 1)::timestamp at time zone 'UTC' and ${orders.createdAt} < (${through}::date + 2)::timestamp at time zone 'UTC'`,
            sql`${day} between ${from}::date and ${through}::date`,
          ),
        )
        .groupBy(
          sql`grouping sets ((1), (1, ${orders.attributedSourceType}, ${orders.attributedSourceId}))`,
        ),
    );
  }

  async buyerContactId(storeId: string, orderId: string) {
    const [order] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ contactId: orders.buyerContactId })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId))),
    );
    return order?.contactId;
  }

  async contactOrderTotals(storeId: string, contactId: string, timeZone: string) {
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<{
        ordersCount: number;
        deliveredCount: number;
        returnedCount: number;
        netSpendPoisha: string;
        firstOrderAt: string | null;
        lastOrderAt: string | null;
        usualGapDays: number | null;
      }>(sql`
      with buyer_orders as (
        select stage, created_at, items_subtotal_poisha, order_discount_poisha,
          delivered_items_subtotal_poisha, delivered_order_discount_poisha,
          cod_amount_poisha, cod_collected_poisha, payment_status,
          (created_at at time zone ${timeZone})::date as day,
          lag((created_at at time zone ${timeZone})::date) over (order by created_at) as previous_day
        from orders where store_id = ${storeId} and buyer_contact_id = ${contactId}
          and stage <> 'cancelled'
      )
      select count(*)::int as "ordersCount",
        count(*) filter (where ${DELIVERED})::int as "deliveredCount",
        count(*) filter (where stage = 'returned')::int as "returnedCount",
        ${NET_SPEND} as "netSpendPoisha",
        min(created_at) as "firstOrderAt", max(created_at) as "lastOrderAt",
        percentile_cont(0.5) within group (order by day - previous_day) as "usualGapDays"
      from buyer_orders
    `),
    );
    const totals = result.rows[0]!;
    return {
      ...totals,
      netSpendPoisha: BigInt(totals.netSpendPoisha),
      firstOrderAt: totals.firstOrderAt === null ? null : new Date(totals.firstOrderAt),
      lastOrderAt: totals.lastOrderAt === null ? null : new Date(totals.lastOrderAt),
    };
  }
}

function retainedOrders(since: string, timeZone: string) {
  return sql`${orders.createdAt} >= (${since}::date - 1)::timestamp at time zone 'UTC'
    and (${orders.createdAt} at time zone ${timeZone})::date >= ${since}::date`;
}
