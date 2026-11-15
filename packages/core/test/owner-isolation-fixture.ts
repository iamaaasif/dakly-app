import { randomUUID } from 'node:crypto';

import { expect } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { TenantDatabase } from '../src/platform/database/tenant-database';

// Only owning-feature tests import their repositories. This helper supplies data and a real owner connection.
export class OwnerIsolationFixture {
  readonly connection = createDatabase(process.env.DATABASE_ADMIN_URL!);
  readonly tenant = new TenantDatabase(this.connection.db);
  readonly a = randomUUID();
  readonly b = randomUUID();
  readonly userA = randomUUID();
  readonly userB = randomUUID();
  readonly memberA = randomUUID();
  readonly memberB = randomUUID();
  async setup() {
    const owner = await this.connection.pool.query(
      "select pg_get_userbyid(relowner)=current_user as owns,relforcerowsecurity as forced from pg_class where oid='stores'::regclass",
    );
    expect(owner.rows).toEqual([{ owns: true, forced: false }]);
    await this.connection.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [this.a, this.b],
    );
    await this.connection.pool.query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test'),($2::uuid,'করিম',$2::text || '@example.test')",
      [this.userA, this.userB],
    );
    await this.connection.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) values($1,$2,$3,'admin','active'),($4,$5,$6,'admin','active')",
      [this.memberA, this.a, this.userA, this.memberB, this.b, this.userB],
    );
  }

  async row(table: string, id: string) {
    return (
      await this.connection.pool.query(`select to_jsonb(t) as row from ${table} t where id=$1`, [
        id,
      ])
    ).rows[0]?.row;
  }

  async close() {
    for (const table of [
      'support_sessions',
      'support_grants',
      'staff_recovery_history',
      'ownership_transfers',
      'customers',
      'audit_log',
      'memberships',
      'roles',
      'subscriptions',
    ])
      await this.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [this.a, this.b],
      ]);
    await this.connection.pool.query(
      'delete from staff_audit_log where target_id=any($1::uuid[])',
      [[this.userA, this.userB]],
    );
    await this.connection.pool.query('delete from stores where id=any($1::uuid[])', [
      [this.a, this.b],
    ]);
    await this.connection.pool.query('delete from users where id=any($1::uuid[])', [
      [this.userA, this.userB],
    ]);
    await this.connection.pool.end();
  }
}
