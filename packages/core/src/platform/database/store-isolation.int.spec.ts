import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { contacts } from '@dakly/db/schema/contacts';
import { outboxEvents } from '@dakly/db/schema/platform';
import { stores } from '@dakly/db/schema/stores';
import { TenantDatabase } from './tenant-database';

// Guards the rules in docs/data/isolation-and-access.md for every table, including tables added
// later: a new shop table without RLS, or a SECURITY DEFINER function without a fixed search_path,
// fails here before it reaches review.
const globalTables = [
  'users',
  'sessions',
  'push_subscriptions',
  'outbox_events',
  'webhook_events',
  'bd_areas',
  'plans',
  'coupons',
  'invoice_counters',
  'staff_users',
  'staff_sessions',
  'staff_audit_log',
  'staff_approvals',
  'platform_settings',
];

describe('store isolation (Postgres)', () => {
  const admin = createDatabase(requireEnv('DATABASE_ADMIN_URL'));
  const app = createDatabase(requireEnv('DATABASE_URL'));
  const database = new TenantDatabase(app.db);
  let storeA: string;
  let storeB: string;

  beforeAll(async () => {
    const created = await admin.db
      .insert(stores)
      .values([
        { name: 'Isolation A', slug: `iso-a-${Date.now()}` },
        { name: 'Isolation B', slug: `iso-b-${Date.now()}` },
      ])
      .returning({ id: stores.id });
    storeA = created[0]!.id;
    storeB = created[1]!.id;
  });

  afterAll(async () => {
    await admin.db.execute(sql`delete from contacts where store_id in (${storeA}, ${storeB})`);
    await admin.db.execute(sql`delete from outbox_events where store_id in (${storeA}, ${storeB})`);
    await admin.db.execute(sql`delete from stores where id in (${storeA}, ${storeB})`);
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it('has RLS and a store policy on every table with store_id, except the global ones', async () => {
    const result = await admin.db.execute<{
      table_name: string;
      has_rls: boolean;
      policies: number;
    }>(sql`
      select c.relname as table_name, c.relrowsecurity as has_rls,
        (select count(*)::int from pg_policies p where p.tablename = c.relname
          and p.qual like '%app.store_id%' and p.with_check like '%app.store_id%') as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from information_schema.columns col
          where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'store_id')`);

    const unprotected = result.rows
      .filter((row) => !globalTables.includes(row.table_name))
      .filter((row) => !row.has_rls || row.policies < 1)
      .map((row) => row.table_name);
    expect(unprotected).toEqual([]);
  });

  it('never forces RLS on the table owner, so migrations and backfills keep working', async () => {
    const result = await admin.db.execute<{ relname: string }>(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relforcerowsecurity`);

    expect(result.rows).toEqual([]);
  });

  it('fixes search_path on every SECURITY DEFINER function and keeps them from PUBLIC', async () => {
    const result = await admin.db.execute<{
      proname: string;
      has_search_path: boolean;
      public_can_run: boolean;
    }>(sql`
      select p.proname,
        coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false) as has_search_path,
        has_function_privilege('public', p.oid, 'execute') as public_can_run
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef`);

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.filter((row) => !row.has_search_path || row.public_can_run)).toEqual([]);
  });

  it("hides another store's contacts and refuses to write into it", async () => {
    await database.forStore(storeA, (tx) =>
      tx
        .insert(contacts)
        .values({ storeId: storeA, phone: '01711000001', source: 'manual', kind: 'lead' }),
    );

    const seenFromB = await database.forStore(storeB, (tx) =>
      tx.select({ id: contacts.id }).from(contacts),
    );
    const writeIntoA = database.forStore(storeB, (tx) =>
      tx
        .insert(contacts)
        .values({ storeId: storeA, phone: '01711000002', source: 'manual', kind: 'lead' }),
    );

    expect(seenFromB).toEqual([]);
    await expect(writeIntoA).rejects.toThrow();
  });

  it('lets the app add to the outbox but not read it; the relay claims rows through a function', async () => {
    await database.forStore(storeA, (tx) =>
      tx
        .insert(outboxEvents)
        .values({ storeId: storeA, type: 'contact.created', payload: { contactId: 'x' } }),
    );

    await expect(app.db.select().from(outboxEvents)).rejects.toThrow();
    const claimed = await app.db.execute<{ store_id: string }>(
      sql`select store_id from claim_outbox_events(100)`,
    );
    expect(claimed.rows.map((row) => row.store_id)).toContain(storeA);
  });

  it('refuses to change an append-only record', async () => {
    const change = database.forStore(storeA, (tx) =>
      tx.execute(sql`update audit_log set reason = 'edited' where store_id = ${storeA}`),
    );

    await expect(change).rejects.toThrow();
  });

  it('finds a store from a public slug without a session', async () => {
    const slug = await admin.db.execute<{ slug: string }>(
      sql`select slug from stores where id = ${storeA}`,
    );
    const found = await app.db.execute<{ store_id: string }>(
      sql`select store_id_for_slug(${slug.rows[0]!.slug}) as store_id`,
    );

    expect(found.rows[0]!.store_id).toBe(storeA);
  });
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}
