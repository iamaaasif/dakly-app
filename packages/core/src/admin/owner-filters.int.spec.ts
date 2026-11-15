import { randomUUID, randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AccountDatabase } from '../platform/database/account-database';
import { StaffRecoveryRepository } from './staff-recovery.repository';
import { SupportRepository } from './support.repository';

describe('support and recovery filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new SupportRepository(f.tenant, f.connection.db);
  const recovery = new StaffRecoveryRepository(new AccountDatabase(f.connection.db), f.tenant);
  const staff = randomUUID(),
    session = randomUUID();
  beforeAll(async () => {
    await f.setup();
    await f.connection.pool.query(
      "insert into staff_users(id,name,email,role,enrolled_at) values($1,'রিনা',$2,'support',now())",
      [staff, `${staff}@example.test`],
    );
    await f.connection.pool.query(
      "insert into staff_sessions(id,staff_user_id,token_hash,expires_at,last_seen_at) values($1,$2,$3,now()+interval '1 hour',now())",
      [session, staff, randomBytes(32)],
    );
  });
  afterAll(async () => {
    // Remove only this fixture's dependent rows before its staff principal.
    await f.connection.pool.query('delete from support_sessions where staff_user_id=$1', [staff]);
    await f.connection.pool.query('delete from support_grants where staff_user_id=$1', [staff]);
    await f.connection.pool.query('delete from staff_sessions where staff_user_id=$1', [staff]);
    await f.connection.pool.query('delete from staff_users where id=$1', [staff]);
    await f.close();
  });
  it('filters grant reads, lists and writes and support session lookup/consumption', async () => {
    const a = randomUUID(),
      b = randomUUID();
    for (const [storeId, id] of [
      [f.a, a],
      [f.b, b],
    ] as const)
      await f.tenant.forStore(storeId, () =>
        repository.insert(storeId, {
          id,
          staffUserId: staff,
          input: {
            targetId: storeId,
            reason: 'Investigate customer issue',
            access: 'write',
            scopes: ['customers'],
            durationMinutes: 30,
          },
          now: new Date(),
        }),
      );
    expect(await repository.find(f.a, a)).toMatchObject({ id: a });
    expect(await repository.find(f.b, a)).toBeUndefined();
    expect((await repository.list(f.a)).map((row) => row.id)).toEqual([a]);
    expect((await repository.list(f.b)).map((row) => row.id)).toEqual([b]);
    await f.tenant.forStore(f.b, () => repository.change(f.b, b, { status: 'denied' }));
    expect(await repository.find(f.b, b)).toMatchObject({ status: 'denied' });
    const before = await f.row('support_grants', a);
    await f.tenant.forStore(f.b, () => repository.change(f.b, a, { status: 'denied' }));
    expect(await f.row('support_grants', a)).toEqual(before);
    const hash = randomBytes(32),
      token = randomBytes(32),
      otherHash = randomBytes(32);
    const principal = (storeId: string, grantId: string) => ({
      storeId,
      grantId,
      staffUserId: staff,
      staffSessionId: session,
    });
    await f.tenant.forStore(f.a, () =>
      repository.handoff(f.a, principal(f.a, a), hash, new Date(Date.now() + 60000)),
    );
    await f.tenant.forStore(f.b, () =>
      repository.handoff(f.b, principal(f.b, b), otherHash, new Date(Date.now() + 60000)),
    );
    expect(await repository.handoffSession(f.a, hash)).toMatchObject({ grantId: a });
    expect(await repository.handoffSession(f.b, otherHash)).toMatchObject({ grantId: b });
    expect(await repository.handoffSession(f.b, hash)).toBeUndefined();
    await f.tenant.forStore(f.b, () => repository.consume(f.b, hash, token, new Date()));
    expect(await repository.handoffSession(f.a, hash)).toMatchObject({ consumedAt: null });
    await f.tenant.forStore(f.a, () => repository.consume(f.a, hash, token, new Date()));
    expect(await repository.session(f.a, token)).toMatchObject({ grantId: a });
    expect(await repository.session(f.b, token)).toBeUndefined();
    expect(await repository.storeName(f.a)).toBe('রিনার দোকান');
    expect(await repository.storeName(f.b)).toBe('করিমের দোকান');
  });
  it('filters recovery history with positive rows in both stores', async () => {
    const a = randomUUID(),
      b = randomUUID();
    for (const [storeId, userId, auditId] of [
      [f.a, f.userA, a],
      [f.b, f.userB, b],
    ] as const) {
      await f.connection.pool.query(
        "insert into staff_audit_log(id,actor_user_id,action,target_type,target_id,reason,action_details) values($1,$2,'account.recovered','user',$2,'Verified recovery','{\"reasonType\":\"lost_phone\"}')",
        [auditId, userId],
      );
      await f.connection.pool.query(
        'insert into staff_recovery_history(store_id,audit_id) values($1,$2)',
        [storeId, auditId],
      );
    }
    expect((await recovery.history(f.a)).map((row) => row.id)).toEqual([a]);
    expect((await recovery.history(f.b)).map((row) => row.id)).toEqual([b]);
  });
});
