import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ProductTagResponse } from '@dakly/contracts/product-lists';
import { productTagLinks, productTags } from '@dakly/db/schema/product-labels';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ProductTagsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string): Promise<ProductTagResponse[]> {
    const productCount = sql<number>`count(${productTagLinks.productId})::int`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: productTags.id, name: productTags.name, productCount })
        .from(productTags)
        .leftJoin(
          productTagLinks,
          and(
            eq(productTagLinks.storeId, storeId),
            eq(productTagLinks.tagId, productTags.id),
            sql`exists (select 1 from products p where p.store_id = ${storeId} and p.id = ${productTagLinks.productId} and p.status <> 'archived')`,
          ),
        )
        .where(eq(productTags.storeId, storeId))
        .groupBy(productTags.id)
        .orderBy(sql`${productCount} desc`, sql`lower(${productTags.name})`),
    );
  }

  // Names that already exist in the shop (ignoring case) keep their spelling.
  async ensure(storeId: string, rows: { id: string; name: string }[]): Promise<string[]> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(productTags)
        .values(rows.map((row) => ({ ...row, storeId })))
        .onConflictDoNothing(),
    );
    const found = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: productTags.id })
        .from(productTags)
        .where(
          and(
            eq(productTags.storeId, storeId),
            inArray(
              sql`lower(${productTags.name})`,
              rows.map(({ name }) => name.toLowerCase()),
            ),
          ),
        ),
    );
    return found.map(({ id }) => id);
  }

  async replaceLinks(storeId: string, productId: string, tagIds: string[]): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      await tx
        .delete(productTagLinks)
        .where(and(eq(productTagLinks.storeId, storeId), eq(productTagLinks.productId, productId)));
      if (tagIds.length)
        await tx
          .insert(productTagLinks)
          .values(tagIds.map((tagId) => ({ storeId, productId, tagId })));
    });
  }
}
