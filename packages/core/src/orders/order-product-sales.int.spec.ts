import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { OrderStage } from '@dakly/contracts/orders';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { StoresService } from '../stores/stores.service';
import { OrderProductSalesRepository } from './order-product-sales.repository';
import { OrderProductSalesService } from './order-product-sales.service';

describe('product sales for the catalogue', () => {
  const f = new OwnerIsolationFixture();
  const now = new Date('2026-11-26T18:01:00Z');
  const sales = new OrderProductSalesService(
    new OrderProductSalesRepository(f.tenant),
    { now: () => now },
    { timeZone: async () => 'Asia/Dhaka' } as StoresService,
  );

  beforeAll(() => f.setup());
  afterAll(async () => {
    for (const table of ['orders', 'product_variants', 'products']) {
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    }
    await f.close();
  });

  async function addProduct(storeId: string) {
    const productId = randomUUID();
    const variantId = randomUUID();
    await f.connection.pool.query(
      "insert into products (id,store_id,name) values ($1,$2,'Scarf')",
      [productId, storeId],
    );
    await f.connection.pool.query(
      "insert into product_variants (id,store_id,product_id,title) values ($1,$2,$3,'Red')",
      [variantId, storeId, productId],
    );
    return variantId;
  }

  async function sell(
    storeId: string,
    variantId: string,
    number: number,
    [at, quantity, stage = 'to_confirm']: [string, number, OrderStage?],
  ) {
    const id = randomUUID();
    await f.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,recipient_name,recipient_phone,
        recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha,created_at,stage,cancel_reason)
       values ($1,$2,$3,'manual','user','Rina','01710000005','Mirpur','Dhaka',10000,10000,$4,$5,
        case when $5 = 'cancelled' then 'not_confirmed' end)`,
      [id, storeId, number, at, stage],
    );
    await f.connection.pool.query(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
        unit_price_poisha,is_stock_tracked) values ($1,$2,$3,$4,'Scarf','Red',$5,10000,false)`,
      [randomUUID(), storeId, id, variantId, quantity],
    );
  }

  it('counts units from the last 30 local dates, excluding cancelled, returned and foreign orders', async () => {
    const variantId = await addProduct(f.a);
    const other = await addProduct(f.b);
    const rows: [string, number, OrderStage?][] = [
      ['2026-10-28T17:59:59Z', 90],
      ['2026-10-28T18:00:00Z', 2],
      ['2026-11-26T18:00:00Z', 3, 'delivered'],
      ['2026-11-25T15:00:00Z', 60, 'cancelled'],
      ['2026-11-25T16:00:00Z', 80, 'returned'],
      ['2026-11-26T18:01:01Z', 70],
    ];
    for (const [index, row] of rows.entries()) await sell(f.a, variantId, index + 1, row);
    await sell(f.b, other, 1, ['2026-11-25T17:00:00Z', 100]);

    expect(await sales.recentUnits(f.a)).toEqual([{ variantId, units: 5 }]);
    expect(await sales.recentUnits(f.b)).toEqual([{ variantId: other, units: 100 }]);
  });
});
