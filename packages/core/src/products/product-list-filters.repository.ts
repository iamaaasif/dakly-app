import { eq, getTableName, ne, sql } from 'drizzle-orm';

import type { ProductListQuery } from '@dakly/contracts/products';
import { products } from '@dakly/db/schema/products';

import { stockReadinessFilter } from './product-stock-readiness-filter.repository';

// Drizzle strips qualifiers in SELECT expressions; this must refer to the outer product.
const productIdColumn = sql`${sql.identifier(getTableName(products))}.${sql.identifier(products.id.name)}`;

// The list search finds a product by its name or by the SKU of any of its variants.
function searchNameOrCode(storeId: string, search: string) {
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  return sql`(${products.name} ilike ${pattern} or exists (select 1 from product_variants v where v.store_id = ${storeId} and v.product_id = ${productIdColumn} and v.status <> 'archived' and v.sku ilike ${pattern}))`;
}

export function listFilters(storeId: string, query: ProductListQuery, lowStockThreshold: number) {
  return [
    eq(products.storeId, storeId),
    ne(products.status, 'archived'),
    query.search ? searchNameOrCode(storeId, query.search) : undefined,
    query.readiness === 'hidden' ? eq(products.status, 'hidden') : undefined,
    query.readiness === 'needs_photo' ? sql`cardinality(${products.imageFileIds}) = 0` : undefined,
    query.readiness === 'needs_price'
      ? sql`exists (select 1 from product_variants v where v.store_id = ${storeId} and v.product_id = ${productIdColumn} and v.status <> 'archived' and coalesce(v.price_override_poisha, ${products.pricePoisha}) = 0)`
      : undefined,
    stockReadinessFilter(storeId, query.readiness, lowStockThreshold),
    query.categoryId
      ? sql`(${products.categoryId} = ${query.categoryId} or ${products.categoryId} in (select id from product_categories where store_id = ${storeId} and parent_id = ${query.categoryId}))`
      : undefined,
    query.brandId ? eq(products.brandId, query.brandId) : undefined,
  ];
}
