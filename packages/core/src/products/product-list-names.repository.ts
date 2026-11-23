import { sql } from 'drizzle-orm';

// Drizzle drops the table name inside a SELECT, so the outer product is named here.
const productColumn = (name: string) => sql`${sql.identifier('products')}.${sql.identifier(name)}`;

// "Clothing > T-shirts" for a sub-category, the name alone for a top-level one.
export const categoryPathSql = sql<string | null>`(
  select case when c.parent_id is null then c.name else p.name || ' > ' || c.name end
  from product_categories c left join product_categories p on p.id = c.parent_id and p.store_id = c.store_id
  where c.id = ${productColumn('category_id')} and c.store_id = ${productColumn('store_id')}
)`;

export const brandNameSql = sql<string | null>`(
  select b.name from product_brands b
  where b.id = ${productColumn('brand_id')} and b.store_id = ${productColumn('store_id')}
)`;
