import { desc, lt, sql } from 'drizzle-orm';

import { products, productVariants } from '@dakly/db/schema/products';

export function productListRank(
  storeId: string,
  cursor: string | undefined,
  sales: { variantId: string; units: number }[] | undefined,
) {
  if (!sales)
    return {
      join: undefined,
      unitsSold: sql<number>`0`,
      rankCreatedAt: sql<null>`null`,
      after: cursor ? lt(products.id, cursor) : undefined,
      order: [desc(products.id)],
    };

  const unitsSold = sql`coalesce(sales.units, 0)`.mapWith(Number);
  const [units, createdAt, id] = cursor?.split('_') ?? [];
  return {
    join: sql`(select ${productVariants.productId} as product_id, sum(variant_sales.units)::bigint as units
      from jsonb_to_recordset(${JSON.stringify(sales)}::jsonb) as variant_sales("variantId" uuid, units bigint)
      inner join ${productVariants} on ${productVariants.id} = variant_sales."variantId" and ${productVariants.storeId} = ${storeId}
      group by ${productVariants.productId}) as sales`,
    unitsSold,
    // Postgres can hold microseconds that a JavaScript Date would drop from the cursor.
    rankCreatedAt: sql<string>`to_char(${products.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    after: cursor
      ? sql`(${unitsSold}, ${products.createdAt}, ${products.id}) < (${units}::bigint, ${createdAt}::timestamptz, ${id}::uuid)`
      : undefined,
    order: [desc(unitsSold), desc(products.createdAt), desc(products.id)],
  };
}
