import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { BillingRepository } from './billing.repository';

describe('plan seat filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new BillingRepository(f.tenant, f.connection.db);
  const a = randomUUID(),
    b = randomUUID();
  beforeAll(async () => {
    await f.setup();
    await f.connection.pool.query(
      `insert into plans(id,code,name,monthly_price_poisha,yearly_price_poisha,limits,is_public) values($1::uuid,$1::text,'Fixture A',0,0,'{"seats":3}',false),($2::uuid,$2::text,'Fixture B',0,0,'{"seats":7}',false)`,
      [a, b],
    );
  });
  afterAll(async () => {
    await f.connection.pool.query('delete from subscriptions where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await f.connection.pool.query('delete from plans where id=any($1::uuid[])', [[a, b]]);
    await f.close();
  });
  it('inserts and reads only the selected store subscription', async () => {
    for (const [storeId, planId] of [
      [f.a, a],
      [f.b, b],
    ] as const)
      await repository.insertSubscription(storeId, {
        planId,
        billingCycle: 'monthly',
        status: 'active',
        currentPeriodPricePoisha: 0,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
        trialEndsAt: null,
      });
    expect(await repository.currentLimits(f.a)).toEqual({ seats: 3 });
    expect(await repository.currentLimits(f.b)).toEqual({ seats: 7 });
    expect((await repository.currentPeriod(f.a))?.limits).toEqual({ seats: 3 });
    expect((await repository.currentPeriod(f.b))?.limits).toEqual({ seats: 7 });
  });
});
