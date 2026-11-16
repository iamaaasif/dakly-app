import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { contacts } from '@dakly/db/schema/contacts';
import { stores } from '@dakly/db/schema/stores';

import { TenantDatabase } from '../platform/database/tenant-database';
import { ContactsRepository } from './contacts.repository';

// Proves the RLS policies, not just the WHERE clauses: store B must never see store A's rows.
// A staff add, as ContactsService.create saves it.
const manualCustomer = { source: 'manual', kind: 'customer' } as const;

describe('ContactsRepository (Postgres)', () => {
  const admin = createDatabase(requireEnv('DATABASE_ADMIN_URL'));
  const app = createDatabase(requireEnv('DATABASE_URL'));
  const database = new TenantDatabase(app.db);
  const repository = new ContactsRepository(database);
  let storeA: string;
  let storeB: string;

  beforeAll(async () => {
    const created = await admin.db
      .insert(stores)
      .values([{ name: 'Store A' }, { name: 'Store B' }])
      .returning({ id: stores.id });
    storeA = created[0]!.id;
    storeB = created[1]!.id;
  });

  afterAll(async () => {
    await admin.db.execute(sql`delete from contacts where store_id in (${storeA}, ${storeB})`);
    await admin.db.execute(sql`delete from stores where id in (${storeA}, ${storeB})`);
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it('finds a contact only inside its own store', async () => {
    const contact = await repository.insert(storeA, {
      ...manualCustomer,
      name: 'Rahim',
      phone: '01712345678',
    });

    expect(await repository.findById(storeA, contact!.id)).toMatchObject({
      name: 'Rahim',
      kind: 'customer',
    });
    expect(await repository.findById(storeB, contact!.id)).toBeUndefined();
  });

  it('hides other stores even when a query has no store filter', async () => {
    const [contact] = await admin.db
      .insert(contacts)
      .values({
        storeId: storeA,
        name: 'Rina',
        phone: '01612345678',
        source: 'manual',
        kind: 'lead',
      })
      .returning({ id: contacts.id });
    const ownRows = await database.forStore(storeA, (tx) => tx.select().from(contacts));
    expect(ownRows.map((row) => row.id)).toContain(contact!.id);

    const rows = await database.forStore(storeB, (tx) => tx.select().from(contacts));

    expect(rows).toEqual([]);
  });

  it('refuses to write a row into another store', async () => {
    const write = database.forStore(storeB, (tx) =>
      tx.insert(contacts).values({
        storeId: storeA,
        name: 'Karim',
        phone: '01812345678',
        source: 'manual',
        kind: 'lead',
      }),
    );

    await expect(write).rejects.toThrow();
  });

  it('returns undefined for a duplicate phone in the same store', async () => {
    await repository.insert(storeA, {
      ...manualCustomer,
      name: 'Sumi',
      phone: '01912345678',
    });

    expect(
      await repository.insert(storeA, {
        ...manualCustomer,
        name: 'Sumi 2',
        phone: '01912345678',
      }),
    ).toBeUndefined();
  });
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set for integration tests (see README)`);
  }
  return value;
}
