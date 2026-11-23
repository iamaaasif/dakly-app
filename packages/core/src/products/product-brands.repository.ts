import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { ProductBrandResponse } from '@dakly/contracts/product-lists';
import { productBrands, products } from '@dakly/db/schema/products';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

export type ProductBrand = Omit<ProductBrandResponse, 'productCount'>;
const columns = { id: productBrands.id, name: productBrands.name };

// Drizzle drops the table name inside a SELECT, which would read as the product's id.
const outerId = sql`${sql.identifier('product_brands')}.${sql.identifier('id')}`;

@Injectable()
export class ProductBrandsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string): Promise<ProductBrandResponse[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...columns,
          productCount: sql<number>`(select count(*)::int from products p where p.store_id = ${storeId} and p.brand_id = ${outerId} and p.status <> 'archived')`,
        })
        .from(productBrands)
        .where(eq(productBrands.storeId, storeId))
        .orderBy(asc(sql`lower(${productBrands.name})`)),
    );
  }

  async find(storeId: string, id: string): Promise<ProductBrand | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(productBrands)
        .where(and(eq(productBrands.storeId, storeId), eq(productBrands.id, id))),
    );
    return rows[0];
  }

  async findByName(storeId: string, name: string): Promise<ProductBrand | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(productBrands)
        .where(
          and(
            eq(productBrands.storeId, storeId),
            sql`lower(${productBrands.name}) = lower(${name})`,
          ),
        ),
    );
    return rows[0];
  }

  async hasProducts(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.brandId, id)))
        .limit(1),
    );
    return rows.length > 0;
  }

  // Returns false when another brand of the shop already has the name.
  async insert(storeId: string, input: ProductBrand): Promise<boolean> {
    return this.writeNamed(() =>
      this.database.forStore(storeId, (tx) =>
        tx.insert(productBrands).values({ storeId, ...input }),
      ),
    );
  }

  rename(storeId: string, id: string, name: string): Promise<boolean> {
    return this.writeNamed(() =>
      this.database.forStore(storeId, (tx) =>
        tx
          .update(productBrands)
          .set({ name })
          .where(and(eq(productBrands.storeId, storeId), eq(productBrands.id, id))),
      ),
    );
  }

  async delete(storeId: string, id: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .delete(productBrands)
        .where(and(eq(productBrands.storeId, storeId), eq(productBrands.id, id))),
    );
  }

  private async writeNamed(write: () => PromiseLike<unknown>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'product_brands_store_name_key')) return false;
      throw error;
    }
  }
}
