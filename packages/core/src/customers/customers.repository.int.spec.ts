import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { customers } from '@dakly/db/schema/customers';
import { stores } from '@dakly/db/schema/stores';
import { TenantDatabase } from '../platform/database/tenant-database';
import { CustomersRepository } from './customers.repository';

// Proves the RLS policies, not just the WHERE clauses: store B must never see store A's rows.
describe('CustomersRepository (Postgres)', () => {
  const admin = createDatabase(requireEnv('DATABASE_ADMIN_URL'));
  const app = createDatabase(requireEnv('DATABASE_URL'));
  const database = new TenantDatabase(app.db);
  const repository = new CustomersRepository(database);
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
    await admin.db.execute(sql`delete from customers where store_id in (${storeA}, ${storeB})`);
    await admin.db.execute(sql`delete from stores where id in (${storeA}, ${storeB})`);
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it('finds a customer only inside its own store', async () => {
    const customer = await repository.insert(storeA, { name: 'Rahim', phone: '01712345678' });

    expect(await repository.findById(storeA, customer!.id)).toMatchObject({ name: 'Rahim' });
    expect(await repository.findById(storeB, customer!.id)).toBeUndefined();
  });

  it('hides other stores even when a query has no store filter', async () => {
    const [customer] = await admin.db
      .insert(customers)
      .values({ storeId: storeA, name: 'Rina', phone: '01612345678' })
      .returning({ id: customers.id });
    const ownRows = await database.forStore(storeA, (tx) => tx.select().from(customers));
    expect(ownRows.map((row) => row.id)).toContain(customer!.id);

    const rows = await database.forStore(storeB, (tx) => tx.select().from(customers));

    expect(rows).toEqual([]);
  });

  it('refuses to write a row into another store', async () => {
    const write = database.forStore(storeB, (tx) =>
      tx.insert(customers).values({ storeId: storeA, name: 'Karim', phone: '01812345678' }),
    );

    await expect(write).rejects.toThrow();
  });

  it('returns undefined for a duplicate phone in the same store', async () => {
    await repository.insert(storeA, { name: 'Sumi', phone: '01912345678' });

    expect(
      await repository.insert(storeA, { name: 'Sumi 2', phone: '01912345678' }),
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
