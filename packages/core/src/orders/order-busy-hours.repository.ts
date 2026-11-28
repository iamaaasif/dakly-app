import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, ne, sql } from 'drizzle-orm';

import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderBusyHoursRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Grouped by position because each bound time zone is a separate parameter, so the expression in
  // select and group by would not match.
  orderHourCounts(storeId: string, since: Date, timeZone: string) {
    const hour = sql<number>`extract(hour from ${orders.createdAt} at time zone ${timeZone})::int`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ hour, orders: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            ne(orders.stage, 'cancelled'),
            gt(orders.createdAt, since),
          ),
        )
        .groupBy(sql`1`),
    );
  }
}
