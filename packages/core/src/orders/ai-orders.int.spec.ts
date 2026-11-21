import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { OrderReportingRepository } from './order-reporting.repository';

describe('orders the AI agent created', () => {
  const f = new OwnerIsolationFixture();
  const reports = new OrderReportingRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-11', timeZone: 'Asia/Dhaka' };
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);

  beforeAll(async () => {
    await f.setup();
    const buyer = randomUUID();
    await query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [buyer, f.a],
    );
    let number = 0;
    for (const [store, by, stage, subtotal, discount, at] of [
      [f.a, 'ai', 'to_pack', 125000, 5000, '2026-11-09T18:30:00Z'],
      [f.a, 'ai', 'delivered', 80000, 0, '2026-11-11T10:00:00Z'],
      [f.a, 'ai', 'cancelled', 99000, 0, '2026-11-10T10:00:00Z'],
      [f.a, 'user', 'to_pack', 70000, 0, '2026-11-10T10:00:00Z'],
      [f.a, 'ai', 'to_pack', 60000, 0, '2026-11-11T18:00:00Z'],
    ] as const)
      await query(
        `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,recipient_name,
           recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,order_discount_poisha,
           cod_amount_poisha,stage,cancel_reason,created_at)
         values($1,$2,$3,'messenger',$4,$5,'x','01710000009','Mirpur','Dhaka',$6,$7,$6,$8,
           case when $8 = 'cancelled' then 'duplicate' end,$9)`,
        [randomUUID(), store, ++number, by, buyer, subtotal, discount, stage, at],
      );
  });

  afterAll(async () => {
    await query('delete from orders where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });

  it('counts the AI orders that were not cancelled, with money after discount', async () => {
    expect(await reports.aiOrders(f.a, range)).toEqual({ count: 2, salesPoisha: 200000n });
  });

  it('shows nothing for another shop', async () => {
    expect(await reports.aiOrders(f.b, range)).toEqual({ count: 0, salesPoisha: 0n });
  });
});
