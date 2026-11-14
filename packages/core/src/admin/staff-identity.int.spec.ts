import { randomUUID, randomInt } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { StaffIdentityService } from './staff-identity.service';
import { StaffIdentityRepository } from './staff-identity.repository';
import { TenantDatabase } from '../platform/database/tenant-database';
const owner = createDatabase(process.env.DATABASE_ADMIN_URL!);
const application = createDatabase(process.env.DATABASE_URL!);
const identity = new StaffIdentityService(
  new StaffIdentityRepository(new TenantDatabase(application.db), application.db),
);
const staffId = randomUUID(),
  storeId = randomUUID();
const userIds: string[] = [];
const phone = () => `017${randomInt(10000000, 99999999)}`;
async function contact(kind: string, value: string) {
  await owner.pool.query(
    'insert into staff_identity_contacts(id,staff_user_id,kind,value) values($1,$2,$3,$4)',
    [randomUUID(), staffId, kind, value],
  );
}
beforeAll(async () => {
  await owner.pool.query(
    "insert into staff_users(id,email,name,role) values($1,$2,'Identity staff','support')",
    [staffId, `${staffId}@example.test`],
  );
  await owner.pool.query("insert into stores(id,name) values($1,'Identity store')", [storeId]);
});
afterAll(async () => {
  await owner.pool.query('delete from memberships where store_id=$1', [storeId]);
  await owner.pool.query('delete from staff_identity_contacts where staff_user_id=$1', [staffId]);
  await owner.pool.query('delete from staff_user_links where staff_user_id=$1', [staffId]);
  await owner.pool.query('delete from users where id=any($1::uuid[])', [userIds]);
  await owner.pool.query('delete from staff_users where id=$1', [staffId]);
  await owner.pool.query('delete from stores where id=$1', [storeId]);
  await Promise.all([owner.pool.end(), application.pool.end()]);
});
it('links a newly inserted verified user and preserves association after staff contact removal', async () => {
  const number = phone(),
    id = randomUUID();
  userIds.push(id);
  await contact('phone', number);
  await owner.pool.query(
    "insert into users(id,name,phone,phone_verified_at) values($1,'New user',$2,now())",
    [id, number],
  );
  expect(await identity.isLinkedUser(staffId, id)).toBe(true);
  await owner.pool.query(
    'delete from staff_identity_contacts where staff_user_id=$1 and value=$2',
    [staffId, number],
  );
  expect(await identity.isLinkedUser(staffId, id)).toBe(true);
});
it('does not link unverified email; verification and later provisioning both establish stable links', async () => {
  const email = `${randomUUID()}@example.test`,
    id = randomUUID();
  userIds.push(id);
  await contact('email', email);
  await owner.pool.query("insert into users(id,name,email) values($1,'Unverified',$2)", [
    id,
    email,
  ]);
  expect(await identity.isLinkedUser(staffId, id)).toBe(false);
  await owner.pool.query('update users set email_verified_at=now() where id=$1', [id]);
  expect(await identity.isLinkedUser(staffId, id)).toBe(true);
  const second = randomUUID(),
    number = phone();
  userIds.push(second);
  await owner.pool.query(
    "insert into users(id,name,phone,phone_verified_at) values($1,'Existing',$2,now())",
    [second, number],
  );
  await contact('phone', number);
  expect(await identity.isLinkedUser(staffId, second)).toBe(true);
});
it('retains the conflict while a verified contact change is uncommitted and after it commits', async () => {
  const number = phone(),
    id = randomUUID();
  userIds.push(id);
  await contact('phone', number);
  await owner.pool.query(
    "insert into users(id,name,phone,phone_verified_at) values($1,'Concurrent',$2,now())",
    [id, number],
  );
  await owner.pool.query(
    "insert into memberships(id,store_id,user_id,built_in_role,status) values($1,$2,$3,'admin','active')",
    [randomUUID(), storeId, id],
  );
  const connection = await owner.pool.connect();
  try {
    await connection.query('begin');
    await connection.query('update users set phone=$2 where id=$1', [id, phone()]);
    expect(await identity.conflictsWithStore(storeId, staffId)).toBe(true);
    await connection.query('commit');
    expect(await identity.conflictsWithStore(storeId, staffId)).toBe(true);
  } finally {
    await connection.query('rollback');
    connection.release();
  }
});
