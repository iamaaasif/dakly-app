import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { ProductCollectionResponse } from '@dakly/contracts/product-lists';
import { productCollectionLinks, productCollections } from '@dakly/db/schema/product-labels';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ProductCollectionsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string): Promise<ProductCollectionResponse[]> {
    const productCount = sql<number>`count(${productCollectionLinks.productId})::int`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: productCollections.id, name: productCollections.name, productCount })
        .from(productCollections)
        .leftJoin(
          productCollectionLinks,
          and(
            eq(productCollectionLinks.storeId, storeId),
            eq(productCollectionLinks.collectionId, productCollections.id),
            sql`exists (select 1 from products p where p.store_id = ${storeId} and p.id = ${productCollectionLinks.productId} and p.status <> 'archived')`,
          ),
        )
        .where(eq(productCollections.storeId, storeId))
        .groupBy(productCollections.id)
        .orderBy(asc(sql`lower(${productCollections.name})`)),
    );
  }

  async countExisting(storeId: string, ids: string[]): Promise<number> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: productCollections.id })
        .from(productCollections)
        .where(and(eq(productCollections.storeId, storeId), inArray(productCollections.id, ids))),
    );
    return rows.length;
  }

  // Returns false when the shop already has a collection with this name.
  async insert(storeId: string, input: { id: string; name: string }): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(productCollections)
        .values({ storeId, ...input })
        .onConflictDoNothing()
        .returning({ id: productCollections.id }),
    );
    return rows.length > 0;
  }

  async replaceLinks(storeId: string, productId: string, collectionIds: string[]): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      await tx
        .delete(productCollectionLinks)
        .where(
          and(
            eq(productCollectionLinks.storeId, storeId),
            eq(productCollectionLinks.productId, productId),
          ),
        );
      if (collectionIds.length)
        await tx
          .insert(productCollectionLinks)
          .values(collectionIds.map((collectionId) => ({ storeId, productId, collectionId })));
    });
  }
}
