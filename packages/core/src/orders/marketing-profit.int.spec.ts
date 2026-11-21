import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { OrderReportingRepository } from './order-reporting.repository';

describe('marketing profit inputs', () => {
  const f = new OwnerIsolationFixture();
  const reports = new OrderReportingRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-11', timeZone: 'Asia/Dhaka' };
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);

  async function order(
    storeId: string,
    number: number,
    {
      stage = 'to_pack',
      attributed = true,
      courier = 6000,
      codFee = null,
      at = '2026-11-10T10:00:00Z',
      items,
    }: {
      stage?: string;
      attributed?: boolean;
      courier?: number | null;
      codFee?: number | null;
      at?: string;
      items: [quantity: number, cost: number | null][];
    },
  ) {
    const id = randomUUID();
    const buyer = randomUUID();
    await query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [buyer, storeId],
    );
    await query(
      `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,recipient_name,
         recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha,
         stage,cancel_reason,courier_charge_poisha,cod_fee_poisha,created_at,
         attributed_source_type,attributed_source_id,attributed_amount_poisha)
       values($1,$2,$3,'messenger','user',$4,'x','01710000009','Mirpur','Dhaka',100000,100000,$5,
         case when $5 = 'cancelled' then 'duplicate' end,$6,$7,$8,
         case when $9 then 'campaign' end, case when $9 then gen_random_uuid() end,
         case when $9 then 100000 end)`,
      [id, storeId, number, buyer, stage, courier, codFee, at, attributed],
    );
    const product = randomUUID();
    const variant = randomUUID();
    await query("insert into products(id,store_id,name) values($1,$2,'পণ্য')", [product, storeId]);
    await query(
      "insert into product_variants(id,store_id,product_id,title,sku) values($1,$2,$3,'M',$4)",
      [variant, storeId, product, `sku-${id}`],
    );
    for (const [quantity, cost] of items)
      await query(
        `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
           unit_price_poisha,unit_cost_poisha,is_stock_tracked)
         values(gen_random_uuid(),$1,$2,$3,'পণ্য','M',$4,50000,$5,false)`,
        [storeId, id, variant, quantity, cost],
      );
  }

  beforeAll(async () => {
    await f.setup();
    await order(f.a, 1, { items: [[2, 20000]], courier: 6000, codFee: 1000 });
    await order(f.a, 2, { items: [[1, 30000]], courier: null });
    // Unknown cost on one item: counted apart, no money from it.
    await order(f.a, 3, {
      items: [
        [1, 30000],
        [1, null],
      ],
    });
    await order(f.a, 4, { stage: 'cancelled', items: [[1, 1000]] });
    await order(f.a, 5, { stage: 'returned', items: [[1, 1000]] });
    await order(f.a, 6, { attributed: false, items: [[1, 1000]] });
    await order(f.a, 7, { at: '2026-11-20T10:00:00Z', items: [[1, 1000]] });
    await order(f.b, 8, { items: [[1, 5000]] });
  });

  afterAll(async () => {
    for (const table of ['order_items', 'orders', 'product_variants', 'products', 'contacts'])
      await query(`delete from ${table} where store_id=any($1::uuid[])`, [[f.a, f.b]]);
    await f.close();
  });

  it('adds cost and delivery for orders with every cost known and counts the rest apart', async () => {
    expect(await reports.marketingProfitInputs(f.a, range)).toEqual({
      counted: 2,
      excluded: 1,
      revenuePoisha: 200000n,
      productCostPoisha: 70000n,
      deliveryCostPoisha: 7000n,
    });
  });

  it('does not count another shop', async () => {
    expect((await reports.marketingProfitInputs(f.b, range)).productCostPoisha).toBe(5000n);
  });
});
