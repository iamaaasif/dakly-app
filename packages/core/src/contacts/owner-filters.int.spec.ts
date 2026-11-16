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
    expect(await repository.findRecipient(f.a, a!.id)).toEqual({
      kind: 'customer',
      isBlocked: false,
      hasPhone: true,
    });
    expect(await repository.findRecipient(f.b, a!.id)).toBeUndefined();
  });
});
