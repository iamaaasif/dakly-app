import { sql } from 'drizzle-orm';

import type { OrderCustomerBadge } from '@dakly/contracts/orders';
import { contactStats } from '@dakly/db/schema/contacts';
import { orders } from '@dakly/db/schema/orders';

// Reads the outer "orders" row, so it only works inside a select from orders. A buyer with no
// contact is matched by phone, as return risk does.
export const customerBadge = sql<OrderCustomerBadge>`(
  case
    when exists (
      select 1 from ${contactStats} stats
      where stats.store_id = "orders"."store_id"
        and stats.contact_id = "orders"."buyer_contact_id"
        and stats.lifecycle_stage = 'best'
    ) then 'vip'
    when exists (
      select 1 from ${orders} earlier
      where earlier.store_id = "orders"."store_id"
        and earlier.number < "orders"."number"
        and case when "orders"."buyer_contact_id" is not null
          then earlier.buyer_contact_id = "orders"."buyer_contact_id"
          else earlier.recipient_phone = "orders"."recipient_phone" end
    ) then 'repeat'
    else 'new'
  end
)`;
