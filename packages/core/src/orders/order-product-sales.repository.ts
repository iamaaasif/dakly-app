import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lte, notInArray, sql } from 'drizzle-orm';

import type { OrderStage } from '@dakly/contracts/orders';
import { orderItems, orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderProductSalesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  unitsByVariant(
    storeId: string,
    {
      timeZone,
      through,
      days,
      excluded,
    }: {
      timeZone: string;
      through: Date;
      days: number;
      excluded: OrderStage[];
    },
  ) {
    // Convert the calendar boundary first so Postgres can use the order timestamp index.
    const since = sql`(((${through.toISOString()}::timestamptz at time zone ${timeZone})::date - ${days - 1}::int)::timestamp at time zone ${timeZone})`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          variantId: orderItems.variantId,
          units: sql`sum(${orderItems.quantity})`.mapWith(Number),
        })
        .from(orders)
        .innerJoin(
          orderItems,
          and(eq(orderItems.storeId, orders.storeId), eq(orderItems.orderId, orders.id)),
        )
        .where(
          and(
            eq(orders.storeId, storeId),
            sql`${orders.createdAt} >= ${since}`,
            lte(orders.createdAt, through),
            notInArray(orders.stage, excluded),
          ),
        )
        .groupBy(orderItems.variantId),
    );
  }
}
