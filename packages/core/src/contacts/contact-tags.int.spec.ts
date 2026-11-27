import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { contacts } from '@dakly/db/schema/contacts';
import { stores } from '@dakly/db/schema/stores';

import { TenantDatabase } from '../platform/database/tenant-database';
import { ContactTagsRepository } from './contact-tags.repository';

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for integration tests`);
  return value;
}

describe('ContactTagsRepository (Postgres)', () => {
  const admin = createDatabase(requireEnv('DATABASE_ADMIN_URL'));
  const app = createDatabase(requireEnv('DATABASE_URL'));
  const repository = new ContactTagsRepository(new TenantDatabase(app.db));
  let storeId: string;
  let otherStoreId: string;

  beforeAll(async () => {
    const created = await admin.db
      .insert(stores)
      .values([{ name: 'Tags shop' }, { name: 'Other tags shop' }])
      .returning({ id: stores.id });
    storeId = created[0]!.id;
    otherStoreId = created[1]!.id;
    await admin.db.insert(contacts).values([
      {
        storeId,
        name: 'Mim',
        phone: '01711000001',
        kind: 'customer',
        source: 'manual',
        tags: ['vip', 'eid buyer'],
      },
      {
        storeId,
        name: 'Nusrat',
        phone: '01711000002',
        kind: 'customer',
        source: 'manual',
        tags: ['vip', 'kurti'],
      },
      {
        storeId,
        name: 'Gone',
        phone: '01711000003',
        kind: 'customer',
        source: 'manual',
        tags: ['deleted only'],
        deletedAt: new Date(),
      },
      { storeId, name: 'Plain', phone: '01711000004', kind: 'customer' },
      {
        storeId: otherStoreId,
        name: 'Stranger',
        phone: '01799999999',
        kind: 'customer',
        source: 'manual',
        tags: ['secret'],
      },
    ]);
  });

  afterAll(async () => {
    await admin.db.execute(
      sql`delete from contacts where store_id in (${storeId}, ${otherStoreId})`,
    );
    await admin.db.execute(sql`delete from stores where id in (${storeId}, ${otherStoreId})`);
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it('lists each tag of the shop once, sorted, without deleted contacts or other shops', async () => {
    expect(await repository.inUse(storeId)).toEqual(['eid buyer', 'kurti', 'vip']);
    expect(await repository.inUse(otherStoreId)).toEqual(['secret']);
  });
});
