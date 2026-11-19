import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { OrderReportingRepository } from './order-reporting.repository';

describe('order summaries without RLS assistance', () => {
  const fixture = new OwnerIsolationFixture();
  const repository = new OrderReportingRepository(fixture.tenant);
  const timeZone = 'Asia/Dhaka';
  const day = '2026-11-05';

  beforeAll(() => fixture.setup());
  afterAll(async () => {
    await fixture.connection.pool.query('delete from orders where store_id=any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await fixture.close();
  });

  it('looks up and counts only orders in the selected store', async () => {
    const foreignOrder = randomUUID();
    const foreignBuyer = randomUUID();
    await fixture.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [foreignBuyer, fixture.b],
    );
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        cod_amount_poisha,created_at,buyer_contact_id) values
       ($1,$2,1001,'manual','user','রিনা','01710000005','Mirpur','Dhaka',12000,12000,'2026-11-05T05:00:00Z',null),
       ($3,$4,1001,'manual','user','রিনা','01710000005','Mirpur','Dhaka',50000,50000,'2026-11-05T05:00:00Z',$5)`,
      [randomUUID(), fixture.a, foreignOrder, fixture.b, foreignBuyer],
    );
    expect(await repository.reportingAnchor(fixture.a, foreignOrder, timeZone)).toBeUndefined();
    expect(await repository.buyerActivityDays(fixture.a, foreignBuyer, timeZone, day)).toEqual([]);
    expect(
      await repository.dailyOrderMetrics(fixture.a, { from: day, through: day, timeZone }),
    ).toMatchObject([{ day, source: 'manual', orders: '1', sales: '12000' }]);
  });
  it('keeps buyer activity at both midnights of a retained local day', async () => {
    const localDay = '2026-10-25';
    const buyerId = randomUUID();
    await fixture.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [buyerId, fixture.a],
    );
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        cod_amount_poisha,created_at,buyer_contact_id) values
       ($1,$2,1002,'manual','user','রিনা','01710000005','Mirpur','Dhaka',12000,12000,'2026-10-25T00:30:00Z',$3)`,
      [randomUUID(), fixture.a, buyerId],
    );
    expect(
      await repository.buyerActivityDays(fixture.a, buyerId, 'Atlantic/Azores', localDay),
    ).toMatchObject([{ day: localDay }]);
    expect(await repository.oldestRetainedOrderDay(fixture.a, 'Atlantic/Azores', localDay)).toBe(
      localDay,
    );
    expect(
      await repository.reportBuyerIds(fixture.a, null, {
        timeZone: 'Atlantic/Azores',
        since: localDay,
        limit: 100,
      }),
    ).toEqual([buyerId]);
  });
});
