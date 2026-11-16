import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ContactsRepository } from './contacts.repository';

// A staff add, as ContactsService.create saves it.
const manualCustomer = { source: 'manual', kind: 'customer' } as const;

describe('contact filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new ContactsRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());
  it('inserts into the selected store and finds only its contacts', async () => {
    const a = await repository.insert(f.a, {
      ...manualCustomer,
      name: 'রিনা',
      phone: '01711000001',
    });
    const b = await repository.insert(f.b, {
      ...manualCustomer,
      name: 'করিম',
      phone: '01711000001',
    });
    expect((await f.row('contacts', b!.id)).store_id).toBe(f.b);
    expect(await repository.findById(f.a, a!.id)).toMatchObject({ name: 'রিনা' });
    expect(await repository.findById(f.b, b!.id)).toMatchObject({ name: 'করিম' });
    expect(await repository.findById(f.b, a!.id)).toBeUndefined();
  });

  it('counts and lists segment matches only in the selected store', async () => {
    const a = await repository.insert(f.a, {
      ...manualCustomer,
      name: 'সুমি',
      phone: '01711000002',
    });
    const b = await repository.insert(f.b, {
      ...manualCustomer,
      name: 'সুমন',
      phone: '01711000002',
    });
    await f.connection.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','granted','manual'),(gen_random_uuid(),$3,$4,'sms','granted','manual')",
      [f.a, a!.id, f.b, b!.id],
    );
    const rules = {
      match: 'all',
      conditions: [{ field: 'consent', channel: 'sms', granted: true }],
    } as const;

    expect(await repository.countMatching(f.b, rules)).toBe(1);
    expect(await repository.listIdsMatching(f.b, rules, { limit: 100 })).toEqual([b!.id]);
  });
});
