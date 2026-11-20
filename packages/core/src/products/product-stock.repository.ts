import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { StockMovementKind } from '@dakly/contracts/products';
import { MAX_STOCK_QUANTITY } from '@dakly/contracts/products';
import { products, productVariants, stockMovements } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';

type StockDelta = { onHandDelta: number; reservedDelta: number };
type StockMovementWrite = {
  variantId: string;
  kind: StockMovementKind;
  quantity: number;
  onHandAfter: number;
  reservedAfter: number;
  orderId: string | null;
  reason: string | null;
  actorUserId: string | null;
  createdAt: Date;
};

@Injectable()
export class ProductStockRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findStockVariant(
    storeId: string,
    variantId: string,
  ): Promise<{ isStockTracked: boolean } | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ isStockTracked: products.isStockTracked })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(products.storeId, storeId),
            eq(productVariants.id, variantId),
          ),
        ),
    );
    return rows[0];
  }

  // Locks the product the way a product edit does, so an import and an edit cannot deadlock.
  async lockStockVariant(
    storeId: string,
    variantId: string,
  ): Promise<{ isStockTracked: boolean } | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ isStockTracked: products.isStockTracked })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(products.storeId, storeId),
            eq(productVariants.id, variantId),
          ),
        )
        .for('no key update', { of: products }),
    );
    return rows[0];
  }

  async changeStock(
    storeId: string,
    variantId: string,
    change: StockDelta,
    now: Date,
  ): Promise<{ onHand: number; reserved: number } | undefined> {
    const onHand = sql`${productVariants.onHand}::bigint + ${change.onHandDelta}`;
    const reserved = sql`${productVariants.reserved}::bigint + ${change.reservedDelta}`;
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(productVariants)
        .set({ onHand, reserved, updatedAt: now })
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.id, variantId),
            sql`${onHand} >= ${reserved} and ${reserved} >= 0 and ${onHand} <= ${MAX_STOCK_QUANTITY} and ${reserved} <= ${MAX_STOCK_QUANTITY}`,
          ),
        )
        .returning({ onHand: productVariants.onHand, reserved: productVariants.reserved }),
    );
    return rows[0];
  }

  async reconcileStock(storeId: string, variantId: string, onHand: number, now: Date) {
    // Calls can share a transaction, so the delta and update need one statement
    // even when the transaction already owns the row lock.
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ onHand: number; reserved: number; onHandDelta: number }>(sql`
        with previous as (
          select on_hand, reserved from ${productVariants}
          where store_id = ${storeId} and id = ${variantId}
            and ${onHand}::bigint between reserved and ${MAX_STOCK_QUANTITY}
          for no key update
        ), changed as (
          update ${productVariants}
          set on_hand = ${onHand}, updated_at = ${now.toISOString()}::timestamptz
          from previous
          where ${productVariants.storeId} = ${storeId} and ${productVariants.id} = ${variantId}
            and previous.on_hand <> ${onHand}
          returning ${productVariants.onHand}
        )
        select coalesce(changed.on_hand, previous.on_hand) as "onHand", previous.reserved,
          coalesce(changed.on_hand - previous.on_hand, 0) as "onHandDelta"
        from previous left join changed on true
      `),
    );
    return rows[0];
  }

  async insertStockMovement(storeId: string, movement: StockMovementWrite): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(stockMovements).values({ storeId, ...movement }),
    );
  }
}
