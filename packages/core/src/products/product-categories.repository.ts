import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';

import type { ProductCategoryResponse } from '@dakly/contracts/product-lists';
import { productCategories, products } from '@dakly/db/schema/products';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

export type ProductCategory = Omit<ProductCategoryResponse, 'productCount'>;
const columns = {
  id: productCategories.id,
  name: productCategories.name,
  parentId: productCategories.parentId,
  sortOrder: productCategories.sortOrder,
};
const nameKeys = ['product_categories_top_name_key', 'product_categories_child_name_key'];

// Drizzle drops the table name inside a SELECT, which would read as the product's id.
const outerId = sql`${sql.identifier('product_categories')}.${sql.identifier('id')}`;

@Injectable()
export class ProductCategoriesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string): Promise<ProductCategoryResponse[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...columns,
          productCount: sql<number>`(select count(*)::int from products p where p.store_id = ${storeId} and p.category_id = ${outerId} and p.status <> 'archived')`,
        })
        .from(productCategories)
        .where(eq(productCategories.storeId, storeId))
        .orderBy(asc(productCategories.sortOrder), asc(sql`lower(${productCategories.name})`)),
    );
  }

  async find(storeId: string, id: string): Promise<ProductCategory | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(productCategories)
        .where(and(eq(productCategories.storeId, storeId), eq(productCategories.id, id))),
    );
    return rows[0];
  }

  async findByName(
    storeId: string,
    parentId: string | null,
    name: string,
    exceptId?: string,
  ): Promise<ProductCategory | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(productCategories)
        .where(
          and(
            eq(productCategories.storeId, storeId),
            parentId === null
              ? isNull(productCategories.parentId)
              : eq(productCategories.parentId, parentId),
            sql`lower(${productCategories.name}) = lower(${name})`,
            exceptId ? ne(productCategories.id, exceptId) : undefined,
          ),
        ),
    );
    return rows[0];
  }

  async hasChildren(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(and(eq(productCategories.storeId, storeId), eq(productCategories.parentId, id)))
        .limit(1),
    );
    return rows.length > 0;
  }

  async hasProducts(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.categoryId, id)))
        .limit(1),
    );
    return rows.length > 0;
  }

  // Returns false when another category of the same parent already has the name.
  async insert(storeId: string, input: Omit<ProductCategory, 'sortOrder'>): Promise<boolean> {
    return this.writeNamed(() =>
      this.database.forStore(storeId, (tx) =>
        tx.insert(productCategories).values({ storeId, ...input }),
      ),
    );
  }

  update(
    storeId: string,
    id: string,
    change: Partial<Omit<ProductCategory, 'id'>>,
  ): Promise<boolean> {
    return this.writeNamed(() =>
      this.database.forStore(storeId, (tx) =>
        tx
          .update(productCategories)
          .set(change)
          .where(and(eq(productCategories.storeId, storeId), eq(productCategories.id, id))),
      ),
    );
  }

  async delete(storeId: string, id: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .delete(productCategories)
        .where(and(eq(productCategories.storeId, storeId), eq(productCategories.id, id))),
    );
  }

  private async writeNamed(write: () => PromiseLike<unknown>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch (error) {
      if (nameKeys.some((key) => isConstraintViolation(error, '23505', key))) return false;
      throw error;
    }
  }
}
