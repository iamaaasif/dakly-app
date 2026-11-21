import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { PoolClient } from 'pg';
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
  'account_security_events',
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
  'abuse_reports',
  'platform_settings',
  'kill_switches',
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
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
        and exists (select 1 from information_schema.columns col
          where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'store_id')`);

    const unprotected = result.rows
      .filter((row) => !globalTables.includes(row.table_name))
      .filter((row) => !row.has_rls || row.policies < 1)
      .map((row) => row.table_name);
    expect(unprotected).toEqual([]);
  });

  it('shows the app only its own rows in every relation with store_id, and fails a table without RLS', async () => {
    const client = await admin.pool.connect();
    const shops = [randomUUID(), randomUUID()];
    const probe = `isolation_probe_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('begin');
      // Replica mode skips foreign keys and triggers, so every table takes a bare row without
      // parent rows. The rollback below removes the rows, the relaxed constraints and the probe.
      await client.query('set local session_replication_role = replica');
      await client.query(
        `create table ${probe} (id uuid primary key default gen_random_uuid(), store_id uuid not null)`,
      );
      await client.query(`grant select on ${probe} to dakly_app`);
      const relations = await client.query<{ name: string; kind: string }>(`
        select c.relname as name, c.relkind as kind
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') and not c.relispartition
          and exists (select 1 from information_schema.columns col where col.table_schema = 'public'
            and col.table_name = c.relname and col.column_name = 'store_id')`);
      const checked = relations.rows.filter((row) => !globalTables.includes(row.name));
      for (const row of checked) if (row.kind !== 'v') await seedEachShop(client, row.name, shops);

      await client.query('set local role dakly_app');
      const failing = new Set<string>();
      for (const [name, shop] of checked.flatMap((row) =>
        shops.map((id) => [row.name, id] as const),
      )) {
        await client.query("select set_config('app.store_id', $1, true)", [shop]);
        const seen = await client.query<{ store_id: string }>(
          `select distinct store_id from ${name}`,
        );
        if (seen.rows.length !== 1 || seen.rows[0]!.store_id !== shop) failing.add(name);
      }

      expect(checked.length).toBeGreaterThan(50);
      expect([...failing]).toEqual([probe]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('gives the app no direct access to a partition, so every read goes through the parent policy', async () => {
    await admin.db.execute(sql`select ensure_monthly_partitions(3)`);
    const result = await admin.db.execute<{
      relname: string;
      relrowsecurity: boolean;
      readable: boolean;
    }>(sql`
      select c.relname, c.relrowsecurity,
        has_table_privilege('dakly_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE') as readable
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relispartition`);

    expect(result.rows.length).toBeGreaterThanOrEqual(12);
    expect(result.rows.filter((row) => !row.relrowsecurity || row.readable)).toEqual([]);
  });

  it('grants the app a privilege on every table and view, so production needs no default privileges', async () => {
    const withoutAccess = [
      // Company metrics, read and written only by owner functions for the admin panel.
      'platform_daily_metrics',
    ];
    const result = await admin.db.execute<{ relname: string }>(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
        -- Partition children are read through their parent's policy.
        and not c.relispartition
        and not has_table_privilege('dakly_app', c.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      order by c.relname`);

    expect(result.rows.map((row) => row.relname)).toEqual(withoutAccess);
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
        coalesce('search_path=pg_catalog, public, pg_temp' = any(p.proconfig), false) as has_search_path,
        exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_can_run
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

// Inserts one row per shop with only store_id and generated key values. Check and not-null
// constraints are dropped inside the caller's transaction, so no table needs realistic values.
async function seedEachShop(client: PoolClient, table: string, shops: string[]) {
  const checks = await client.query<{ name: string }>(
    "select conname as name from pg_constraint where conrelid = $1::regclass and contype = 'c'",
    [table],
  );
  for (const check of checks.rows)
    await client.query(`alter table ${table} drop constraint if exists "${check.name}"`);
  const required = await client.query<{ name: string; type: string; is_key: boolean }>(
    `select a.attname as name, format_type(a.atttypid, null) as type,
       exists (select 1 from pg_index i where i.indrelid = a.attrelid and i.indisprimary
         and a.attnum = any(i.indkey)) as is_key
     from pg_attribute a
     where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped and a.attnotnull
       and not a.atthasdef and a.attgenerated = '' and a.attidentity = '' and a.attname <> 'store_id'`,
    [table],
  );
  const keys = required.rows.filter((column) => column.is_key);
  for (const column of required.rows.filter((column) => !column.is_key))
    await client.query(`alter table ${table} alter column "${column.name}" drop not null`);
  const columns = ['store_id', ...keys.map((column) => `"${column.name}"`)].join(', ');
  const values = ['$1', ...keys.map((column) => generatedValue(column.type))].join(', ');
  for (const shop of shops)
    await client.query(`insert into ${table} (${columns}) values (${values})`, [shop]);
}

function generatedValue(type: string) {
  const values: Record<string, string> = {
    uuid: 'gen_random_uuid()',
    text: "'isolation'",
    date: 'current_date',
    'timestamp with time zone': 'now()',
  };
  const value = values[type];
  if (!value) throw new Error(`No fixture value for primary key type ${type}`);
  return value;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}
