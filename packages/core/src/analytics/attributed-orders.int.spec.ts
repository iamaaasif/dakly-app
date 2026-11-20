import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AnalyticsRepository } from './analytics.repository';

describe('orders credited to a source', () => {
  const f = new OwnerIsolationFixture();
  const analytics = new AnalyticsRepository(f.tenant);
  const campaignId = randomUUID();
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);

  beforeAll(async () => {
    await f.setup();
    let number = 0;
    for (const [store, name, stage] of [
      [f.a, 'রিনা', 'to_pack'],
      [f.a, 'নিপা', 'cancelled'],
      [f.b, 'করিমের ক্রেতা', 'to_pack'],
    ] as const) {
      const buyerId = randomUUID();
      await query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,$3,'manual','customer')",
        [buyerId, store, name],
      );
      await query(
        `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,
          recipient_name,recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
          cod_amount_poisha,stage,cancel_reason,attributed_source_type,attributed_source_id,
          attributed_amount_poisha)
         values($1,$2,$3,'manual','user',$4,'x','01710000009','Mirpur','Dhaka',125000,125000,$5,
          case when $5 = 'cancelled' then 'duplicate' end,'campaign',$6,125000)`,
        [randomUUID(), store, ++number, buyerId, stage, campaignId],
      );
    }
  });

  afterAll(async () => {
    await query('delete from orders where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });

  it('lists live orders with the buyer, for the source store only', async () => {
    const source = { type: 'campaign', id: campaignId } as const;
    expect(await analytics.attributedOrders(f.a, source, { limit: 10 })).toMatchObject([
      { name: 'রিনা', amountPoisha: 125000 },
    ]);
    expect(await analytics.attributedOrders(f.b, source, { limit: 10 })).toMatchObject([
      { name: 'করিমের ক্রেতা' },
    ]);
  });

  it('pages by order id', async () => {
    const source = { type: 'campaign', id: campaignId } as const;
    const rows = await analytics.attributedOrders(f.a, source, { limit: 1 });
    expect(rows).toHaveLength(1);
    expect(
      await analytics.attributedOrders(f.a, source, { limit: 1, cursor: rows[0]!.id }),
    ).toEqual([]);
  });
});
