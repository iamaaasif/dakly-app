import { getTableName, sql, type SQL } from 'drizzle-orm';

import type { ProductReadiness } from '@dakly/contracts/products';
import { products } from '@dakly/db/schema/products';

const productId = sql`${sql.identifier(getTableName(products))}.${sql.identifier(products.id.name)}`;

// Out of stock means no live variant has anything available; running low means some do, but not many.
export function stockReadinessFilter(
  storeId: string,
  readiness: ProductReadiness | undefined,
  lowStockThreshold: number,
): SQL | undefined {
  if (readiness !== 'running_low' && readiness !== 'out_of_stock') return undefined;
  const liveVariant = sql`select 1 from product_variants v where v.store_id = ${storeId} and v.product_id = ${productId} and v.status <> 'archived'`;
  const hasAvailable = sql`exists (${liveVariant} and v.on_hand - v.reserved > 0)`;
  if (readiness === 'out_of_stock') return sql`${products.isStockTracked} and not ${hasAvailable}`;
  return sql`${products.isStockTracked} and exists (${liveVariant} and v.on_hand - v.reserved <= coalesce(v.low_stock_threshold, ${lowStockThreshold}::int)) and ${hasAvailable}`;
}
