import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import type { ProductCategoryResponse } from '@dakly/contracts/product-lists';
import { productCategories } from '@dakly/db/schema/products';

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
          ),
        ),
    );
    return rows[0];
  }

  // Returns false when another category of the same parent already has the name.
  async insert(storeId: string, input: Omit<ProductCategory, 'sortOrder'>): Promise<boolean> {
    return this.writeNamed(() =>
      this.database.forStore(storeId, (tx) =>
        tx.insert(productCategories).values({ storeId, ...input }),
      ),
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
