import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, inArray, ne, sql } from 'drizzle-orm';

import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ChatOrderTotalsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Orders that came from a chat since a moment, not counting cancelled ones.
  async since(storeId: string, since: Date) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          count: count(),
          totalPoisha: sql<string>`coalesce(sum(${orders.itemsSubtotalPoisha} - ${orders.orderDiscountPoisha} + ${orders.deliveryChargePoisha}), 0)::text`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.source, ['messenger', 'instagram', 'whatsapp']),
            ne(orders.stage, 'cancelled'),
            gte(orders.createdAt, since),
          ),
        ),
    );
    return { count: row?.count ?? 0, totalPoisha: Number(row?.totalPoisha ?? 0) };
  }
}
