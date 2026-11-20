import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { attributionSourceTypes } from '@dakly/contracts/orders';
import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

export type AttributionWrite = {
  sourceType: (typeof attributionSourceTypes)[number];
  sourceId: string;
  channel: string;
  touchId: string;
  touchAt: Date;
  windowDays: 1 | 3 | 7;
  amountPoisha: number;
};

const clearedAttribution = {
  sourceType: null,
  sourceId: null,
  channel: null,
  touchId: null,
  touchAt: null,
  windowDays: null,
  amountPoisha: null,
};

@Injectable()
export class OrderAttributionRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async find(storeId: string, orderId: string, lock?: 'no key update') {
    const [order] = await this.database.forStore(storeId, (tx) => {
      const query = tx
        .select({
          buyerContactId: orders.buyerContactId,
          stage: orders.stage,
          recipientPhone: orders.recipientPhone,
          isRecipientBuyer: orders.isRecipientBuyer,
          createdAt: orders.createdAt,
          itemsSubtotalPoisha: orders.itemsSubtotalPoisha,
          orderDiscountPoisha: orders.orderDiscountPoisha,
          sourceType: orders.attributedSourceType,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)));
      return lock ? query.for(lock) : query;
    });
    return order;
  }

  save(storeId: string, orderId: string, record: AttributionWrite | null) {
    const { sourceType, sourceId, channel, touchId, touchAt, windowDays, amountPoisha } =
      record ?? clearedAttribution;
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(orders)
        .set({
          attributedSourceType: sourceType,
          attributedSourceId: sourceId,
          attributedChannel: channel,
          attributedTouchId: touchId,
          attributedTouchAt: touchAt,
          attributedWindowDays: windowDays,
          attributedAmountPoisha: amountPoisha,
          // The staff editor uses updated_at to detect edits to the order itself.
          updatedAt: sql`${orders.updatedAt}`,
        })
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId))),
    );
  }
}
