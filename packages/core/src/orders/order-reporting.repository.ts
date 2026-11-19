import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';

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

  async reportingAnchor(storeId: string, orderId: string, timeZone: string, now: Date) {
    const [order] = await this.database.forStore(storeId, (tx) => {
      const day = sql`(${orders.createdAt} at time zone ${timeZone})::date`;
      return tx
        .select({
          day: sql<string>`${day}::text`,
          buyerContactId: orders.buyerContactId,
          retained: sql<boolean>`${day} >= ${retainedDay(now, timeZone)}`,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)));
    });
    return order;
  }

  async buyerActivityDays(storeId: string, contactId: string, timeZone: string, now: Date) {
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
          and o.created_at >= (${retainedDay(now, timeZone)})::timestamp at time zone ${timeZone}
      `),
    );
    return rows;
  }

  dailyOrderMetrics(storeId: string, range: { from: string; through: string; timeZone: string }) {
    const { from, through, timeZone } = range;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          day: sql<string>`(${orders.createdAt} at time zone ${timeZone})::date::text`,
          orders: sql<string>`count(*)::text`,
          deliveredOrders: sql<string>`count(*) filter (where ${DELIVERED})::text`,
          netSpend: NET_SPEND,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            ne(orders.stage, 'cancelled'),
            sql`${orders.createdAt} >= ${from}::date::timestamp at time zone ${timeZone}`,
            sql`${orders.createdAt} < (${through}::date + 1)::timestamp at time zone ${timeZone}`,
          ),
        )
        .groupBy(sql`1`),
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

function retainedDay(now: Date, timeZone: string) {
  return sql`((${now.toISOString()}::timestamptz at time zone ${timeZone})::date - interval '24 months')::date`;
}
