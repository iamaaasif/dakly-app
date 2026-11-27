import { sql } from 'drizzle-orm';

import { orderItems } from '@dakly/db/schema/orders';

// Reads the outer "orders" row, so it only works inside a select from orders.
export const itemPreview = sql<string | null>`(
  select string_agg(label, ', ' order by id)
  from (
    select item.id, item.product_name || case when item.variant_title = 'Default' then ''
      else ' (' || item.variant_title || ')' end || ' × ' || item.quantity::text as label
    from ${orderItems} item
    where item.store_id = "orders"."store_id" and item.order_id = "orders"."id"
    order by item.id limit 2
  ) lines
)`;
