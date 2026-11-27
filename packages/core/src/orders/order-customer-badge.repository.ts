import { sql } from 'drizzle-orm';

import type { OrderCustomerBadge } from '@dakly/contracts/orders';
import { contactStats } from '@dakly/db/schema/contacts';
import { orders } from '@dakly/db/schema/orders';

// Reads the outer "orders" row, so it only works inside a select from orders. A buyer with no
// contact is matched by phone. Two branches, not one CASE, so each can use its own index.
export const customerBadge = sql<OrderCustomerBadge>`(
  case
    when exists (
      select 1 from ${contactStats} stats
      where stats.store_id = "orders"."store_id"
        and stats.contact_id = "orders"."buyer_contact_id"
        and stats.lifecycle_stage = 'best'
    ) then 'vip'
    when "orders"."buyer_contact_id" is not null and exists (
      select 1 from ${orders} earlier
      where earlier.store_id = "orders"."store_id"
        and earlier.buyer_contact_id = "orders"."buyer_contact_id"
        and earlier.number < "orders"."number"
    ) then 'repeat'
    when "orders"."buyer_contact_id" is null and exists (
      select 1 from ${orders} earlier
      where earlier.store_id = "orders"."store_id"
        and earlier.recipient_phone = "orders"."recipient_phone"
        and earlier.number < "orders"."number"
    ) then 'repeat'
    else 'new'
  end
)`;
