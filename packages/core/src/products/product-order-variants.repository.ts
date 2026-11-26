import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { products, productVariants } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ProductOrderVariantsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  lockProducts(storeId: string, productIds: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: products.id,
          pricePoisha: products.pricePoisha,
          status: products.status,
          isVisibleInChats: products.isVisibleInChats,
          negotiationEnabled: products.negotiationEnabled,
          negotiationOpeningPoisha: products.negotiationOpeningPoisha,
          negotiationFloorPoisha: products.negotiationFloorPoisha,
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
        .for('no key update'),
    );
  }

  lockArchiveVariants(storeId: string, productId: string) {
    return this.database.forStore(storeId, async (tx) => {
      // Product edits already lock the product before changing its variants.
      const [product] = await this.lockProducts(storeId, [productId]);
      if (!product) return null;
      const variants = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(and(eq(productVariants.storeId, storeId), eq(productVariants.productId, productId)))
        .orderBy(productVariants.id)
        .for('no key update');
      return variants.map(({ id }) => id);
    });
  }

  async lockVariants(storeId: string, variantIds: string[]): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(and(eq(productVariants.storeId, storeId), inArray(productVariants.id, variantIds)))
        .orderBy(productVariants.id)
        .for('no key update'),
    );
  }

  stock(storeId: string, variantIds: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          variantId: productVariants.id,
          onHand: productVariants.onHand,
          reserved: productVariants.reserved,
        })
        .from(productVariants)
        .where(and(eq(productVariants.storeId, storeId), inArray(productVariants.id, variantIds))),
    );
  }

  productIds(storeId: string, variantIds: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinct({ productId: productVariants.productId })
        .from(productVariants)
        .where(and(eq(productVariants.storeId, storeId), inArray(productVariants.id, variantIds))),
    );
  }

  weights(storeId: string, variantIds: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ variantId: productVariants.id, weightGrams: products.weightGrams })
        .from(productVariants)
        .innerJoin(
          products,
          and(eq(products.id, productVariants.productId), eq(products.storeId, storeId)),
        )
        .where(and(eq(productVariants.storeId, storeId), inArray(productVariants.id, variantIds))),
    );
  }

  orderVariants(storeId: string, variantIds: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          variantId: productVariants.id,
          productName: products.name,
          variantTitle: productVariants.title,
          unitPricePoisha:
            sql<number>`coalesce(${productVariants.priceOverridePoisha}, ${products.pricePoisha})`.mapWith(
              Number,
            ),
          unitCostPoisha: productVariants.costPoisha,
          isStockTracked: products.isStockTracked,
        })
        .from(productVariants)
        .innerJoin(
          products,
          and(eq(products.id, productVariants.productId), eq(products.storeId, storeId)),
        )
        .where(
          and(
            eq(productVariants.storeId, storeId),
            inArray(productVariants.id, variantIds),
            ne(products.status, 'archived'),
            ne(productVariants.status, 'archived'),
          ),
        ),
    );
  }
}
