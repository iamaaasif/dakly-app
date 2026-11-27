import { Inject, Injectable } from '@nestjs/common';
import { and, arrayOverlaps, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import type { ProductOption } from '@dakly/contracts/products';
import { products, productVariants } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';
import { categoryPathSql } from './product-list-names.repository';
import { type Variant, variantSnapshot } from './product-snapshots.repository';
import { chatProductFilter, type Product } from './products.repository';

export type SearchCandidate = Pick<
  Product,
  'id' | 'name' | 'description' | 'category' | 'aliases' | 'pricePoisha'
> & { variants: Variant[] };
@Injectable()
export class ProductSearchRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Only the words and prices search needs, for every offerable product; a shop's catalogue is small enough to rank in memory.
  listSearchCandidates(storeId: string, limit: number): Promise<SearchCandidate[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          category: categoryPathSql,
          aliases: products.aliases,
          pricePoisha: products.pricePoisha,
          variants: variantSnapshot(storeId),
        })
        .from(products)
        .where(chatProductFilter(storeId))
        .orderBy(desc(products.id))
        .limit(limit),
    );
  }

  listPostProductNames(storeId: string, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.storeId, storeId))
        .orderBy(desc(products.id))
        .limit(limit),
    );
  }

  findPostProductsByPhotos(storeId: string, fileIds: string[]) {
    return this.database.forStore(storeId, (tx) => {
      const matchingVariants = tx
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.storeId, storeId),
            arrayOverlaps(productVariants.imageFileIds, fileIds),
          ),
        );
      const variantPhoto = inArray(products.id, matchingVariants);
      return tx
        .select({ id: products.id, variantPhoto: sql<boolean>`${variantPhoto}` })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            or(arrayOverlaps(products.imageFileIds, fileIds), variantPhoto),
          ),
        )
        .limit(2);
    });
  }

  async nearestForChat(
    storeId: string,
    input: { embedding: readonly number[]; model: string; limit: number },
  ): Promise<{ id: string; distance: number }[]> {
    const vector = JSON.stringify(input.embedding);
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ id: string; distance: number }>(sql`
        SELECT id, search_embedding <=> ${vector}::vector AS distance
        FROM products
        WHERE store_id = ${storeId} AND status = 'active' AND is_visible_in_chats
          AND embedding_model = ${input.model} AND search_embedding IS NOT NULL
        ORDER BY distance, id
        LIMIT ${input.limit}
      `),
    );
    return result.rows.map((row) => ({ id: row.id, distance: Number(row.distance) }));
  }

  // Products with no embedding, or one built by a model other than the configured one.
  async staleSearchProductIds(
    storeId: string,
    input: { after: string | null; model: string; limit: number },
  ): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            ne(products.status, 'archived'),
            input.after ? gt(products.id, input.after) : undefined,
            or(
              isNull(products.searchEmbedding),
              isNull(products.embeddingModel),
              ne(products.embeddingModel, input.model),
            ),
          ),
        )
        .orderBy(asc(products.id))
        .limit(input.limit),
    );
    return rows.map((row) => row.id);
  }

  async findSearchSource(storeId: string, id: string) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          category: categoryPathSql,
          aliases: products.aliases,
          options: sql<ProductOption[]>`${products.options}`,
          searchTextHash: products.searchTextHash,
        })
        .from(products)
        .where(
          and(eq(products.storeId, storeId), eq(products.id, id), ne(products.status, 'archived')),
        ),
    );
    return rows[0];
  }

  // The hash guards against a slow embedding overwriting one built from newer text.
  async saveSearchEmbedding(
    storeId: string,
    id: string,
    input: { embedding: readonly number[]; model: string; textHash: string },
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(products)
        .set({
          searchEmbedding: [...input.embedding],
          embeddingModel: input.model,
          searchTextHash: input.textHash,
        })
        .where(and(eq(products.storeId, storeId), eq(products.id, id))),
    );
  }
}
