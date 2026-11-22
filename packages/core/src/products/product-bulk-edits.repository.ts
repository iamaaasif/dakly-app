import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';

import type { ProductBulkEditChange } from '@dakly/contracts/product-bulk-edits';
import { productBulkEdits, products, productVariants } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';

export type BulkEditVariant = {
  id: string;
  costPoisha: number | null;
  priceOverridePoisha: number | null;
  onHand: number;
};
export type BulkEditProduct = {
  id: string;
  pricePoisha: number;
  compareAtPricePoisha: number | null;
  category: string | null;
  status: 'active' | 'hidden';
  isStockTracked: boolean;
  variants: BulkEditVariant[];
};
export type ProductFieldChange = Partial<{
  pricePoisha: number;
  compareAtPricePoisha: number | null;
  category: string | null;
  status: 'active' | 'hidden';
}>;
export type BulkEditRecord = {
  id: string;
  changes: ProductBulkEditChange[];
  stockReason: string | null;
  createdAt: Date;
  undoUntil: Date;
  undoneAt: Date | null;
};
const recordColumns = {
  id: productBulkEdits.id,
  changes: productBulkEdits.changes,
  stockReason: productBulkEdits.stockReason,
  createdAt: productBulkEdits.createdAt,
  undoUntil: productBulkEdits.undoUntil,
  undoneAt: productBulkEdits.undoneAt,
};

@Injectable()
export class ProductBulkEditsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Products are locked in id order so two bulk edits on the same rows cannot deadlock.
  async lockProducts(storeId: string, productIds: string[]): Promise<BulkEditProduct[]> {
    const rows = await this.database.forStore(storeId, async (tx) => {
      const locked = await tx
        .select({
          id: products.id,
          pricePoisha: products.pricePoisha,
          compareAtPricePoisha: products.compareAtPricePoisha,
          category: products.category,
          status: products.status,
          isStockTracked: products.isStockTracked,
        })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            inArray(products.id, productIds),
            ne(products.status, 'archived'),
          ),
        )
        .orderBy(products.id)
        .for('no key update');
      const variants = locked.length
        ? await tx
            .select({
              id: productVariants.id,
              productId: productVariants.productId,
              costPoisha: productVariants.costPoisha,
              priceOverridePoisha: productVariants.priceOverridePoisha,
              onHand: productVariants.onHand,
            })
            .from(productVariants)
            .where(
              and(
                eq(productVariants.storeId, storeId),
                inArray(
                  productVariants.productId,
                  locked.map((product) => product.id),
                ),
                ne(productVariants.status, 'archived'),
              ),
            )
        : [];
      return locked.map((product) => ({
        ...product,
        status: product.status as 'active' | 'hidden',
        variants: variants
          .filter((variant) => variant.productId === product.id)
          .map(({ productId: _productId, ...variant }) => variant),
      }));
    });
    return rows;
  }

  async updateProduct(
    storeId: string,
    productId: string,
    change: ProductFieldChange,
    now: Date,
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(products)
        .set({ ...change, updatedAt: now })
        .where(and(eq(products.storeId, storeId), eq(products.id, productId))),
    );
  }

  async updateVariantCost(
    storeId: string,
    variantId: string,
    costPoisha: number | null,
    now: Date,
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(productVariants)
        .set({ costPoisha, updatedAt: now })
        .where(and(eq(productVariants.storeId, storeId), eq(productVariants.id, variantId))),
    );
  }

  async insertRecord(
    storeId: string,
    record: {
      actorUserId: string | null;
      changes: ProductBulkEditChange[];
      stockReason: string | null;
      createdAt: Date;
      undoUntil: Date;
    },
  ): Promise<BulkEditRecord> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(productBulkEdits)
        .values({ storeId, ...record })
        .returning(recordColumns),
    );
    return rows[0]!;
  }

  async lockRecord(storeId: string, id: string): Promise<BulkEditRecord | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(recordColumns)
        .from(productBulkEdits)
        .where(and(eq(productBulkEdits.storeId, storeId), eq(productBulkEdits.id, id)))
        .for('update'),
    );
    return rows[0];
  }

  async markUndone(storeId: string, id: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(productBulkEdits)
        .set({ undoneAt: now })
        .where(and(eq(productBulkEdits.storeId, storeId), eq(productBulkEdits.id, id))),
    );
  }

  listUndoable(storeId: string, now: Date): Promise<BulkEditRecord[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(recordColumns)
        .from(productBulkEdits)
        .where(
          and(
            eq(productBulkEdits.storeId, storeId),
            isNull(productBulkEdits.undoneAt),
            gt(productBulkEdits.undoUntil, now),
          ),
        )
        .orderBy(desc(productBulkEdits.createdAt), desc(productBulkEdits.id))
        .limit(5),
    );
  }
}
