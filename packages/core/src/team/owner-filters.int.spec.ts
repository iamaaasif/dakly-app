import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { RolesRepository } from './roles.repository';
import { MembersRepository } from './members.repository';
import { OwnershipTransferRepository } from './ownership-transfer.repository';
import { AccountDatabase } from '../platform/database/account-database';
import { TeamRepository } from './team.repository';
const permissions = { areas: {}, seeFullPhone: false, exportLists: false, refund: false };
describe('team filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const roles = new RolesRepository(f.tenant);
  const members = new MembersRepository(f.tenant, f.connection.db);
  const transfers = new OwnershipTransferRepository(f.tenant);
  const team = new TeamRepository(f.tenant, f.connection.db, new AccountDatabase(f.connection.db));
  beforeAll(() => f.setup());
  afterAll(() => f.close());
  it('filters role lists, names, references, changes and deletions', async () => {
    const a = await roles.insert(f.a, { name: 'রিনা', permissions }),
      b = await roles.insert(f.b, { name: 'করিম', permissions });
    expect((await roles.list(f.a, { limit: 50 })).map((row) => row.id)).toEqual([a.id]);
    expect((await roles.list(f.b, { limit: 50 })).map((row) => row.id)).toEqual([b.id]);
    expect(await roles.find(f.a, a.id)).toMatchObject({ id: a.id });
    expect(await roles.find(f.b, a.id)).toBeUndefined();
    expect(await roles.findNamed(f.a, 'রিনা')).toBe(a.id);
    expect(await roles.findNamed(f.b, 'রিনা')).toBeUndefined();
    await members.change(f.a, f.memberA, { builtInRole: null, roleId: a.id }, new Date());
    expect(await roles.isReferenced(f.a, a.id)).toBe(true);
    expect(await roles.isReferenced(f.b, a.id)).toBe(false);
    expect(
      await roles.change(f.b, b.id, { name: 'নিজের ভূমিকা', permissions }, new Date()),
    ).toMatchObject({ id: b.id, name: 'নিজের ভূমিকা' });
    const before = await f.row('roles', a.id);
    expect(
      await roles.change(f.b, a.id, { name: 'বিদেশী', permissions }, new Date()),
    ).toBeUndefined();
    await roles.remove(f.b, a.id);
    expect(await f.row('roles', a.id)).toEqual(before);
    await roles.remove(f.b, b.id);
    expect(await roles.find(f.b, b.id)).toBeUndefined();
  });
  it('filters membership ids, users, recipients, lists, counts, tokens and role lookups', async () => {
    expect(await members.find(f.a, f.memberA)).toMatchObject({ id: f.memberA });
    expect(await members.find(f.b, f.memberA)).toBeUndefined();
    expect(await members.forUser(f.a, f.userA)).toMatchObject({ id: f.memberA });
    expect(await members.forUser(f.b, f.userA)).toBeUndefined();
    expect((await members.list(f.b, { limit: 50 })).map((row) => row.id)).toEqual([f.memberB]);
    const input = { phone: '01711000002', builtInRole: 'support_agent' as const },
      hash = Buffer.alloc(32, 1);
    const invite = await members.insertInvite(
      f.a,
      input,
      f.userA,
      hash,
      new Date(Date.now() + 60000),
    );
    expect(await members.findRecipient(f.a, input)).toMatchObject({ id: invite.id });
    expect(await members.findRecipient(f.b, input)).toBeUndefined();
    expect(await members.matchesToken(f.a, invite.id, hash)).toBe(true);
    expect(await members.matchesToken(f.b, invite.id, hash)).toBe(false);
    expect(await members.countSeats(f.a, new Date())).toBe(2);
    expect(await members.countSeats(f.b, new Date())).toBe(1);
    const role = await roles.insert(f.a, { name: 'ভূমিকা', permissions });
    expect(await members.findRole(f.a, role.id)).toMatchObject({ areas: {} });
    expect(await members.findRole(f.b, role.id)).toBeUndefined();
    const before = await f.row('memberships', f.memberA);
    expect(
      await members.change(f.b, f.memberB, { builtInRole: 'marketer' }, new Date()),
    ).toMatchObject({ builtInRole: 'marketer' });
    expect(
      await members.change(f.b, f.memberA, { builtInRole: 'marketer' }, new Date()),
    ).toBeUndefined();
    expect(await f.row('memberships', f.memberA)).toEqual(before);
  });
  it('filters current membership access independently of RLS', async () => {
    expect(await team.findAccess(f.a, f.userA)).toBeDefined();
    expect(await team.findAccess(f.b, f.userA)).toBeUndefined();
  });
  it('filters pending transfers, id lookups, completion and expiry', async () => {
    const now = new Date(),
      expiry = new Date(now.getTime() + 60000);
    const a = await transfers.insert(f.a, f.userA, f.userB, expiry),
      b = await transfers.insert(f.b, f.userB, f.userA, expiry);
    expect(await transfers.current(f.a, now)).toMatchObject({ id: a.id });
    expect(await transfers.current(f.b, now)).toMatchObject({ id: b.id });
    expect(await transfers.find(f.a, a.id)).toMatchObject({ id: a.id });
    expect(await transfers.find(f.b, a.id)).toBeUndefined();
    const before = await f.row('ownership_transfers', a.id);
    expect(await transfers.finish(f.b, b.id, 'cancelled', now)).toMatchObject({
      status: 'cancelled',
    });
    expect(await transfers.finish(f.b, a.id, 'cancelled', now)).toBeUndefined();
    expect(await f.row('ownership_transfers', a.id)).toEqual(before);
    // Both stores have expired pending rows, so a missing store filter changes the foreign row.
    await f.connection.pool.query(
      "update ownership_transfers set status='pending',expires_at=$1 where id=any($2::uuid[])",
      [new Date(now.getTime() - 1000), [a.id, b.id]],
    );
    await transfers.expire(f.b, now);
    expect(await transfers.find(f.b, b.id)).toMatchObject({ status: 'expired' });
    expect(await transfers.find(f.a, a.id)).toMatchObject({ status: 'pending' });
    expect(await transfers.find(f.a, randomUUID())).toBeUndefined();
  });
});
