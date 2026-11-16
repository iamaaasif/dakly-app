import { randomUUID } from 'node:crypto';

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
      isOverPlanLimit: false,
      hasPhone: true,
    });
    expect(await repository.findRecipient(f.b, a!.id)).toBeUndefined();
  });

  it('lists, edits, deletes and reads identities only in the selected store', async () => {
    const a = await repository.insert(f.a, {
      ...manualCustomer,
      name: 'সুমি',
      phone: '01711000002',
    });
    const b = await repository.insert(f.b, {
      ...manualCustomer,
      name: 'সুমি',
      phone: '01711000002',
    });
    const connectionId = randomUUID();
    await f.connection.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1,$2,'facebook_page',$3,'রিনার পেজ')",
      [connectionId, f.a, randomUUID()],
    );
    await f.connection.pool.query(
      "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values(gen_random_uuid(),$1,$2,$3,'messenger','psid-1')",
      [f.a, a!.id, connectionId],
    );

    const listed = await repository.list(f.b, { limit: 50, phone: '01711000002' });
    expect(listed.map((row) => row.id)).toEqual([b!.id]);
    expect(await repository.findIdentities(f.b, a!.id)).toEqual([]);
    expect(await repository.update(f.b, a!.id, { name: 'করিম' })).toBeUndefined();
    expect(await repository.softDelete(f.b, a!.id, new Date())).toBe(false);
    expect(await f.row('contacts', a!.id)).toMatchObject({ name: 'সুমি', deleted_at: null });
    expect(await repository.findIdentities(f.a, a!.id)).toHaveLength(1);
  });

  it('counts segment matches only in the selected store', async () => {
    const a = await repository.insert(f.a, {
      ...manualCustomer,
      name: 'সুমি',
      phone: '01711000003',
    });
    const b = await repository.insert(f.b, {
      ...manualCustomer,
      name: 'সুমন',
      phone: '01711000003',
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
  });
});
