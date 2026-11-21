import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

import type { ProductOption } from '@dakly/contracts/products';
import { products } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';
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
          category: products.category,
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

  async findSearchSource(storeId: string, id: string) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          category: products.category,
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
