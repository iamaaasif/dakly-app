import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoresRepository } from './stores.repository';

describe('store filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new StoresRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());
  it('selects and changes only the requested store', async () => {
    expect(await repository.find(f.a)).toMatchObject({ id: f.a });
    expect(await repository.settings(f.b)).toMatchObject({ id: f.b });
    const before = await f.row('stores', f.a);
    expect(await repository.changeSettings(f.b, { name: 'নতুন দোকান' }, new Date())).toMatchObject({
      id: f.b,
      name: 'নতুন দোকান',
    });
    expect(await repository.changeExtensions(f.b, ['chats'], new Date())).toMatchObject({
      id: f.b,
      extensions: ['chats'],
    });
    expect(await f.row('stores', f.a)).toEqual(before);
  });
  it('creates the store and its counters under the requested id only', async () => {
    const created = randomUUID();
    try {
      await repository.insert(
        created,
        {
          name: 'সুমির দোকান',
          businessType: 'Clothing',
          district: 'Dhaka',
          howYouSell: ['social_media'],
          customerListSize: 'under_500',
          planCode: 'starter',
          billingCycle: 'monthly',
        },
        [],
      );
      expect(await repository.find(created)).toMatchObject({ id: created, name: 'সুমির দোকান' });
      const counters = await f.connection.pool.query(
        'select store_id from store_counters where store_id=any($1::uuid[])',
        [[created, f.a, f.b]],
      );
      expect(counters.rows).toEqual([{ store_id: created }]);
    } finally {
      await f.connection.pool.query('delete from store_counters where store_id=$1', [created]);
      await f.connection.pool.query('delete from stores where id=$1', [created]);
    }
  });
});
