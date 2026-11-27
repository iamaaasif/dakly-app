import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { contacts } from '@dakly/db/schema/contacts';
import { stores } from '@dakly/db/schema/stores';

import { TenantDatabase } from '../platform/database/tenant-database';
import { ContactsRepository } from './contacts.repository';

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for integration tests`);
  return value;
}

describe('ContactsRepository.changeTagForMany (Postgres)', () => {
  const admin = createDatabase(requireEnv('DATABASE_ADMIN_URL'));
  const app = createDatabase(requireEnv('DATABASE_URL'));
  const repository = new ContactsRepository(new TenantDatabase(app.db));
  let storeId: string;
  let otherStoreId: string;
  const ids: Record<string, string> = {};

  async function tagsOf(name: string) {
    const [row] = await admin.db
      .select({ tags: contacts.tags })
      .from(contacts)
      .where(eq(contacts.id, ids[name]!));
    return row!.tags;
  }

  beforeAll(async () => {
    const created = await admin.db
      .insert(stores)
      .values([{ name: 'Bulk tag shop' }, { name: 'Other bulk tag shop' }])
      .returning({ id: stores.id });
    storeId = created[0]!.id;
    otherStoreId = created[1]!.id;
    const base = { kind: 'customer', source: 'manual' } as const;
    const rows = await admin.db
      .insert(contacts)
      .values([
        { ...base, storeId, name: 'Has other', phone: '01711100001', tags: ['vip'] },
        { ...base, storeId, name: 'Has it', phone: '01711100002', tags: ['eid'] },
        {
          ...base,
          storeId,
          name: 'Full',
          phone: '01711100003',
          tags: Array.from({ length: 50 }, (_, index) => `t${index}`),
        },
        { ...base, storeId, name: 'Gone', phone: '01711100004', deletedAt: new Date() },
        { ...base, storeId: otherStoreId, name: 'Stranger', phone: '01711100005' },
      ])
      .returning({ id: contacts.id, name: contacts.name });
    for (const row of rows) ids[row.name!] = row.id;
  });

  afterAll(async () => {
    await admin.db.delete(contacts).where(eq(contacts.storeId, storeId));
    await admin.db.delete(contacts).where(eq(contacts.storeId, otherStoreId));
    await admin.db.delete(stores).where(eq(stores.id, storeId));
    await admin.db.delete(stores).where(eq(stores.id, otherStoreId));
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it('adds the tag to the current list and skips full, tagged, deleted and other-store contacts', async () => {
    const changed = await repository.changeTagForMany(
      storeId,
      Object.values(ids),
      { tag: 'eid', change: 'add' },
      50,
    );

    expect(changed).toEqual([ids['Has other']]);
    expect(await tagsOf('Has other')).toEqual(['vip', 'eid']);
    expect(await tagsOf('Has it')).toEqual(['eid']);
    expect(await tagsOf('Stranger')).toEqual([]);
  });

  it('removes only the tag it was asked to', async () => {
    const changed = await repository.changeTagForMany(
      storeId,
      [ids['Has other']!],
      { tag: 'eid', change: 'remove' },
      50,
    );

    expect(changed).toEqual([ids['Has other']]);
    expect(await tagsOf('Has other')).toEqual(['vip']);
  });
});
