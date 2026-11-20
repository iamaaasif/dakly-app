import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

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

const attributionFields = {
  buyerContactId: orders.buyerContactId,
  stage: orders.stage,
  recipientPhone: orders.recipientPhone,
  isRecipientBuyer: orders.isRecipientBuyer,
  createdAt: orders.createdAt,
  itemsSubtotalPoisha: orders.itemsSubtotalPoisha,
  orderDiscountPoisha: orders.orderDiscountPoisha,
  sourceType: orders.attributedSourceType,
  sourceId: orders.attributedSourceId,
  channel: orders.attributedChannel,
  touchId: orders.attributedTouchId,
  touchAt: orders.attributedTouchAt,
  windowDays: orders.attributedWindowDays,
  amountPoisha: orders.attributedAmountPoisha,
};

@Injectable()
export class OrderAttributionRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  rebuildPage(
    storeId: string,
    range: {
      startedAt: string;
      timeZone: string;
      after: { id: string; at: string } | null;
      limit: number;
    },
  ) {
    const { startedAt, timeZone, after, limit } = range;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ ...attributionFields, id: orders.id, at: sql<string>`${orders.createdAt}::text` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            lte(orders.createdAt, new Date(startedAt)),
            sql`${orders.createdAt} >= ((${startedAt}::timestamptz at time zone ${timeZone})::date - 364)::timestamp at time zone ${timeZone}`,
            after
              ? sql`(${orders.createdAt}, ${orders.id}) > (${after.at}::timestamptz, ${after.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(asc(orders.createdAt), asc(orders.id))
        .limit(limit),
    );
  }

  async find(storeId: string, orderId: string, lock?: 'no key update') {
    const [order] = await this.database.forStore(storeId, (tx) => {
      const query = tx
        .select(attributionFields)
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)));
      return lock ? query.for(lock) : query;
    });
    return order;
  }

  lockRebuildOrders(storeId: string, ids: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ ...attributionFields, id: orders.id })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), inArray(orders.id, ids)))
        .orderBy(asc(orders.id))
        .for('no key update'),
    );
  }

  saveRebuilt(storeId: string, writes: { orderId: string; record: AttributionWrite | null }[]) {
    const rows = writes.map(({ orderId, record }) => ({
      orderId,
      ...(record ?? clearedAttribution),
    }));
    return this.database.forStore(storeId, (tx) =>
      tx.execute(sql`
      update orders as o set
        attributed_source_type = patch."sourceType",
        attributed_source_id = patch."sourceId",
        attributed_channel = patch.channel,
        attributed_touch_id = patch."touchId",
        attributed_touch_at = patch."touchAt",
        attributed_window_days = patch."windowDays",
        attributed_amount_poisha = patch."amountPoisha"
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as patch(
        "orderId" uuid, "sourceType" text, "sourceId" uuid, channel text,
        "touchId" uuid, "touchAt" timestamptz, "windowDays" smallint, "amountPoisha" bigint
      )
      where o.store_id=${storeId} and o.id=patch."orderId"
    `),
    );
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
