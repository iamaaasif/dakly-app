import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderReportingRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

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
        count(*) filter (where stage in ('delivered', 'partially_delivered'))::int as "deliveredCount",
        count(*) filter (where stage = 'returned')::int as "returnedCount",
        coalesce(sum(coalesce(delivered_items_subtotal_poisha, items_subtotal_poisha)
          - coalesce(delivered_order_discount_poisha, order_discount_poisha)) filter (
          where stage in ('delivered', 'partially_delivered') and (
            payment_status = 'paid'
            or (payment_status = 'advance_paid' and cod_amount_poisha = 0)
            or (payment_status = 'cod_collected' and cod_collected_poisha >= cod_amount_poisha)
          )), 0)::text as "netSpendPoisha",
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
