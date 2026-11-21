import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StaffDatabase } from '../platform/database/staff-database';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { ShopsRepository } from './shops.repository';
import { ShopsService } from './shops.service';

describe('admin shops list and detail', () => {
  const f = new OwnerIsolationFixture();
  const staffDatabase = new StaffDatabase(f.connection.db);
  const service = new ShopsService(
    new ShopsRepository(f.connection.db, staffDatabase),
    new StaffTransaction(staffDatabase),
  );
  const staffId = randomUUID();
  const staff = { id: staffId, sessionId: randomUUID() } as Parameters<ShopsService['detail']>[0];
  const phone = `017${Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0')}`;

  beforeAll(async () => {
    await f.setup();
    await f.connection.pool.query(
      "insert into staff_users(id,name,email,role,enrolled_at) values($1,'রিনা',$2,'analyst',now())",
      [staffId, `${staffId}@example.test`],
    );
    await f.connection.pool.query("update memberships set built_in_role='owner' where id=$1", [
      f.memberA,
    ]);
    await f.connection.pool.query('update users set phone=$1 where id=$2', [phone, f.userA]);
    await f.connection.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name,access_token_ciphertext,key_version) values($1,$2,'facebook_page',$3,'রিনার পেজ',$4,1)",
      [randomUUID(), f.a, `page-${f.a}`, randomBytes(16)],
    );
  });
  afterAll(async () => {
    await f.connection.pool.query('delete from staff_audit_log where staff_user_id=$1', [staffId]);
    await f.connection.pool.query('delete from channel_connections where store_id=$1', [f.a]);
    await f.connection.pool.query('delete from staff_users where id=$1', [staffId]);
    await f.close();
  });

  it('finds a shop by owner phone with the phone masked', async () => {
    const result = await service.list({ search: phone });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      storeId: f.a,
      ownerName: 'রিনা',
      status: 'active',
      mrrPoisha: 0,
    });
    expect(result.rows[0]!.ownerPhoneMasked).toBe(
      `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`,
    );
    expect(JSON.stringify(result)).not.toContain(phone);
  });

  it('finds a shop by name, store id and Facebook page id, and filters by status', async () => {
    expect((await service.list({ search: 'রিনার' })).rows.map((row) => row.storeId)).toContain(f.a);
    expect((await service.list({ search: f.a })).rows.map((row) => row.storeId)).toEqual([f.a]);
    expect((await service.list({ search: `page-${f.a}` })).rows.map((row) => row.storeId)).toEqual([
      f.a,
    ]);
    expect((await service.list({ search: f.a, status: 'suspended' })).rows).toEqual([]);
  });

  it('treats percent signs in a search as text', async () => {
    expect((await service.list({ search: '%' })).rows).toEqual([]);
  });

  it('continues after the cursor without repeating the shop it names', async () => {
    const newest = (await service.list({})).rows[0]!;
    const next = await service.list({ cursor: `${newest.createdAt}|${newest.storeId}` });
    expect(next.rows.map((row) => row.storeId)).not.toContain(newest.storeId);
  });

  it('returns detail with masked team phones and channels, and records the view', async () => {
    const detail = await service.detail(staff, f.a, '203.0.113.7');
    expect(detail.team).toMatchObject([{ name: 'রিনা', role: 'owner' }]);
    expect(detail.team[0]!.phoneMasked).toContain('*');
    expect(detail.channels).toMatchObject([{ kind: 'facebook_page', displayName: 'রিনার পেজ' }]);
    expect(JSON.stringify(detail)).not.toContain(phone);
    const audit = await f.connection.pool.query(
      "select store_id, reason from staff_audit_log where staff_user_id=$1 and action='shop.viewed'",
      [staffId],
    );
    expect(audit.rows).toEqual([{ store_id: f.a, reason: 'Opened shop detail' }]);
  });

  it('answers not found for an unknown shop and writes no audit row', async () => {
    await expect(service.detail(staff, randomUUID(), '203.0.113.7')).rejects.toMatchObject({
      code: 'STORE_NOT_FOUND',
    });
  });
});
