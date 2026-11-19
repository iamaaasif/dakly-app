import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderAttributionRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async lock(storeId: string, orderId: string) {
    const [order] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          buyerContactId: orders.buyerContactId,
          stage: orders.stage,
          itemsSubtotalPoisha: orders.itemsSubtotalPoisha,
          orderDiscountPoisha: orders.orderDiscountPoisha,
          sourceType: orders.attributedSourceType,
          sourceId: orders.attributedSourceId,
          channel: orders.attributedChannel,
          touchId: orders.attributedTouchId,
          touchAt: orders.attributedTouchAt,
          windowDays: orders.attributedWindowDays,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
        .for('no key update'),
    );
    return order;
  }

  save(
    storeId: string,
    orderId: string,
    record: Pick<
      typeof orders.$inferInsert,
      | 'attributedSourceType'
      | 'attributedSourceId'
      | 'attributedChannel'
      | 'attributedTouchId'
      | 'attributedTouchAt'
      | 'attributedWindowDays'
      | 'attributedAmountPoisha'
    >,
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(orders)
        // The staff editor uses updated_at to detect edits to the order itself.
        .set({ ...record, updatedAt: sql`${orders.updatedAt}` })
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId))),
    );
  }
}
