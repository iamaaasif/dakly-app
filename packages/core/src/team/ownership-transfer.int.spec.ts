import 'reflect-metadata';
import { randomInt } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { maskPhone } from '@dakly/contracts/phone';
import { ownershipTransferResponseSchema } from '@dakly/contracts/team';
import { createDatabase } from '@dakly/db/client';
import { users } from '@dakly/db/schema/auth';
import { stores } from '@dakly/db/schema/stores';
import { memberships } from '@dakly/db/schema/team';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { SignInCodesService } from '../auth/sign-in-codes.service';
import { UsersService } from '../auth/users.service';
import { EmailService } from '../email/email.service';
import { DatabaseModule } from '../platform/database/database.module';
import { DATABASE_CONNECTION } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsService } from '../sessions/sessions.service';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(TestModule);
const path = '/store/ownership-transfer';
type Account = { id: string; phone: string; cookie: string };
describe('ownership transfer over Fastify and Postgres', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const sms = new FakeSmsDriver();
  const storeIds: string[] = [];
  const userIds: string[] = [];
  let app: NestFastifyApplication;
  const request = (
    url: string,
    payload: object,
    actor: Account,
    method: 'POST' | 'DELETE' = 'POST',
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: { origin: 'http://localhost:3000', cookie: actor.cookie },
      remoteAddress: `2001:db8::${randomInt(1, 65535).toString(16)}`,
    });
  async function account(): Promise<Account> {
    const phone = `017${randomInt(10000000, 99999999)}`;
    const [user] = await admin.db
      .insert(users)
      .values({ name: 'Rina', phone, phoneVerifiedAt: new Date() })
      .returning({ id: users.id });
    userIds.push(user!.id);
    const session = await app.get(SessionsService).create(user!.id, { isRemembered: false });
    return { id: user!.id, phone, cookie: `dakly_session=${session.token}` };
  }
  async function fixture(recipient?: Account) {
    const owner = await account();
    const member = recipient ?? (await account());
    const [store] = await admin.db
      .insert(stores)
      .values({ name: 'Transfer test' })
      .returning({ id: stores.id });
    const storeId = store!.id;
    storeIds.push(storeId);
    const rows = await admin.db
      .insert(memberships)
      .values([
        { storeId, userId: owner.id, builtInRole: 'owner', status: 'active' },
        { storeId, userId: member.id, builtInRole: 'support_agent', status: 'active' },
      ])
      .returning({ id: memberships.id });
    await request('/me/active-store', { storeId }, owner);
    await request('/me/active-store', { storeId }, member);
    return { storeId, owner, member, ownerMembershipId: rows[0]!.id, membershipId: rows[1]!.id };
  }
  async function proof(f: Awaited<ReturnType<typeof fixture>>) {
    const response = await request(`${path}/code`, { membershipId: f.membershipId }, f.owner);
    expect(response.statusCode).toBe(204);
    return sms.messages
      .findLast((message) => message.to === f.owner.phone)!
      .text.match(/\d{6}/)![0];
  }
  async function start(f: Awaited<ReturnType<typeof fixture>>) {
    const code = await proof(f);
    const response = await request(path, { membershipId: f.membershipId, code }, f.owner);
    expect(response.statusCode).toBe(201);
    return { ...response.json(), code } as { id: string; expiresAt: string; code: string };
  }
  async function owners(storeId: string) {
    const result = await admin.pool.query(
      "select user_id from memberships where store_id = $1 and status = 'active' and built_in_role = 'owner'",
      [storeId],
    );
    return result.rows.map((row: { user_id: string }) => row.user_id);
  }
  beforeAll(async () => {
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) => sms.send(message));
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await admin.pool.query('delete from audit_log where store_id = any($1::uuid[])', [storeIds]);
    if ((await admin.pool.query("select to_regclass('ownership_transfers') as name")).rows[0].name)
      await admin.pool.query('delete from ownership_transfers where store_id = any($1::uuid[])', [
        storeIds,
      ]);
    await admin.db.delete(memberships).where(inArray(memberships.storeId, storeIds));
    await admin.pool.query('delete from sessions where user_id = any($1::uuid[])', [userIds]);
    await admin.db.delete(stores).where(inArray(stores.id, storeIds));
    await admin.pool.query('delete from account_security_events where user_id = any($1::uuid[])', [
      userIds,
    ]);
    await admin.db.delete(users).where(inArray(users.id, userIds));
    await admin.pool.end();
    await app.close();
    vi.restoreAllMocks();
  });
  it('transfers once under parallel acceptance, audits both roles and refreshes next-request access', async () => {
    const f = await fixture();
    const transfer = await start(f);
    expect(new Date(transfer.expiresAt).getTime() - Date.now()).toBeGreaterThan(47.99 * 3600000);
    expect(new Date(transfer.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(48 * 3600000);
    expect(
      (await app.inject({ url: path, headers: { cookie: f.member.cookie } })).json().transfer.id,
    ).toBe(transfer.id);
    const results = await Promise.all(
      [1, 2].map(() => request(`${path}/accept`, { transferId: transfer.id }, f.member)),
    );
    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 400]);
    expect(await owners(f.storeId)).toEqual([f.member.id]);
    const old = await admin.db
      .select()
      .from(memberships)
      .where(eq(memberships.id, f.ownerMembershipId));
    expect(old[0]!.builtInRole).toBe('admin');
    expect(
      (await request(`${path}/code`, { membershipId: f.membershipId }, f.owner)).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/members', headers: { cookie: f.member.cookie } })).statusCode,
    ).toBe(200);
    const audit = await admin.pool.query(
      "select entity_id, actor_user_id from audit_log where store_id=$1 and action='member.role_changed'",
      [f.storeId],
    );
    expect(audit.rows.map((row: { entity_id: string }) => row.entity_id).sort()).toEqual(
      [f.ownerMembershipId, f.membershipId].sort(),
    );
    expect(
      audit.rows.every((row: { actor_user_id: string }) => row.actor_user_id === f.member.id),
    ).toBe(true);
  });
  it('names the recipient with a masked phone and never sends the raw phone or email', async () => {
    const f = await fixture();
    await admin.db.update(users).set({ name: 'Nusrat Jahan' }).where(eq(users.id, f.member.id));
    const recipient = {
      recipientName: 'Nusrat Jahan',
      recipientContact: maskPhone(f.member.phone),
    };
    const code = await proof(f);
    const started = await request(path, { membershipId: f.membershipId, code }, f.owner);
    const current = await app.inject({ url: path, headers: { cookie: f.owner.cookie } });
    const accepted = await request(`${path}/accept`, { transferId: started.json().id }, f.member);
    for (const [response, transfer] of [
      [started, started.json()],
      [current, current.json().transfer],
      [accepted, accepted.json()],
    ]) {
      expect(ownershipTransferResponseSchema.parse(transfer)).toMatchObject(recipient);
      expect(response.body).not.toContain(f.member.phone);
    }
    const emailOnly = await fixture();
    const email = `transfer-${randomInt(1, 1e9)}@example.com`;
    await admin.pool.query(
      'update users set email=$2, email_verified_at=now(), phone=null, phone_verified_at=null where id=$1',
      [emailOnly.member.id, email],
    );
    const response = await request(
      path,
      { membershipId: emailOnly.membershipId, code: await proof(emailOnly) },
      emailOnly.owner,
    );
    expect(ownershipTransferResponseSchema.parse(response.json())).toMatchObject({
      recipientName: 'Rina',
      recipientContact: null,
    });
    expect(response.body).not.toContain(email);
  });
  it('denies wrong members, cancellation, expiry, code reuse and a second open transfer', async () => {
    const f = await fixture();
    const transfer = await start(f);
    expect((await request(`${path}/accept`, { transferId: transfer.id }, f.owner)).statusCode).toBe(
      403,
    );
    expect(
      (await request(path, { membershipId: f.membershipId, code: transfer.code }, f.owner))
        .statusCode,
    ).toBe(400);
    expect(
      (await request(`${path}/code`, { membershipId: f.membershipId }, f.owner)).statusCode,
    ).toBe(409);
    expect((await request(`${path}/${transfer.id}`, {}, f.member, 'DELETE')).statusCode).toBe(403);
    expect((await request(`${path}/${transfer.id}`, {}, f.owner, 'DELETE')).statusCode).toBe(204);
    expect(
      (await request(`${path}/accept`, { transferId: transfer.id }, f.member)).statusCode,
    ).toBe(400);
    const expired = await fixture();
    const pending = await start(expired);
    await admin.pool.query(
      "update ownership_transfers set expires_at = now() - interval '1 second' where id=$1",
      [pending.id],
    );
    expect(
      (await request(`${path}/accept`, { transferId: pending.id }, expired.member)).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ url: path, headers: { cookie: expired.owner.cookie } })).json(),
    ).toEqual({ transfer: null });
    expect(await owners(expired.storeId)).toEqual([expired.owner.id]);
  });
  it('rejects foreign memberships and transfer ids and applies RLS without a store filter', async () => {
    const a = await fixture();
    const b = await fixture();
    const transfer = await start(a);
    expect(
      (await request(`${path}/code`, { membershipId: a.membershipId }, b.owner)).statusCode,
    ).toBe(404);
    expect(
      (await request(`${path}/accept`, { transferId: transfer.id }, b.member)).statusCode,
    ).toBe(404);
    expect((await request(`${path}/${transfer.id}`, {}, b.owner, 'DELETE')).statusCode).toBe(404);
    const rows = await app
      .get(TenantDatabase)
      .forStore(b.storeId, (tx) => tx.execute(sql`select id from ownership_transfers`));
    expect(rows.rows).toEqual([]);
    const changed = await app
      .get(TenantDatabase)
      .forStore(b.storeId, (tx) =>
        tx.execute(
          sql`update ownership_transfers set status='cancelled' where id=${transfer.id} returning id`,
        ),
      );
    expect(changed.rows).toEqual([]);
  });
  it('consumes proof on database failure and rolls both roles back if audit fails', async () => {
    const f = await fixture();
    const code = await proof(f);
    const audit = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await request(path, { membershipId: f.membershipId, code }, f.owner)).statusCode).toBe(
      500,
    );
    audit.mockRestore();
    expect((await request(path, { membershipId: f.membershipId, code }, f.owner)).statusCode).toBe(
      400,
    );
    expect((await app.inject({ url: path, headers: { cookie: f.owner.cookie } })).json()).toEqual({
      transfer: null,
    });
    const other = await fixture();
    const transfer = await start(other);
    const record = app.get(AuditService).record.bind(app.get(AuditService));
    const failure = vi
      .spyOn(app.get(AuditService), 'record')
      .mockImplementation(async (storeId, entry) => {
        await record(storeId, entry);
        if (entry.entityId === other.membershipId) throw new Error('second audit failed');
      });
    expect(
      (await request(`${path}/accept`, { transferId: transfer.id }, other.member)).statusCode,
    ).toBe(500);
    failure.mockRestore();
    expect(await owners(other.storeId)).toEqual([other.owner.id]);
    expect(
      (
        await admin.pool.query(
          "select id from audit_log where store_id=$1 and action='member.role_changed'",
          [other.storeId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await request(`${path}/accept`, { transferId: transfer.id }, other.member)).statusCode,
    ).toBe(200);
  });
  it('serializes acceptance against removal without leaving zero owners', async () => {
    const f = await fixture();
    const transfer = await start(f);
    const results = await Promise.all([
      request(`${path}/accept`, { transferId: transfer.id }, f.member),
      request(`/members/${f.membershipId}`, {}, f.owner, 'DELETE'),
    ]);
    expect(await owners(f.storeId)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode < 300)).toHaveLength(1);
    if (results[0]!.statusCode === 200) expect(await owners(f.storeId)).toEqual([f.member.id]);
    else expect(await owners(f.storeId)).toEqual([f.owner.id]);
  });
  it('binds proof to recipient, store, actor and current verified contact', async () => {
    const f = await fixture();
    const other = await fixture();
    const alternate = await account();
    const [alternateMembership] = await admin.db
      .insert(memberships)
      .values({ storeId: f.storeId, userId: alternate.id, builtInRole: 'admin', status: 'active' })
      .returning({ id: memberships.id });
    const [identity] = await admin.db.select().from(users).where(eq(users.id, f.owner.id));
    const code = await proof(f);
    expect(
      (await request(path, { membershipId: alternateMembership!.id, code }, f.owner)).json().error
        .code,
    ).toBe('AUTH_CODE_INVALID');
    expect(
      (await request(path, { membershipId: other.membershipId, code }, other.owner)).statusCode,
    ).toBe(400);
    expect(
      (await request(path, { membershipId: f.ownerMembershipId, code }, f.owner)).statusCode,
    ).toBe(400);
    await admin.db
      .update(users)
      .set({ phoneVerifiedAt: new Date(Date.now() + 1000) })
      .where(eq(users.id, f.owner.id));
    expect((await request(path, { membershipId: f.membershipId, code }, f.owner)).statusCode).toBe(
      400,
    );
    expect(await owners(f.storeId)).toEqual([f.owner.id]);
    await admin.db
      .update(users)
      .set({ phoneVerifiedAt: identity!.phoneVerifiedAt })
      .where(eq(users.id, f.owner.id));
    expect((await request(path, { membershipId: f.membershipId, code }, f.owner)).statusCode).toBe(
      201,
    );
  });
  it('uses verified email first and rejects a general sign-in code', async () => {
    const general = await fixture();
    expect(
      (
        await request(
          '/auth/code',
          { purpose: 'sign_in', phone: general.owner.phone },
          general.owner,
        )
      ).statusCode,
    ).toBe(204);
    const generalCode = sms.messages
      .findLast((message) => message.to === general.owner.phone)!
      .text.match(/\d{6}/)![0];
    expect(
      (
        await request(
          path,
          { membershipId: general.membershipId, code: generalCode },
          general.owner,
        )
      ).statusCode,
    ).toBe(400);
    const f = await fixture();
    const email = `${f.owner.id}@example.test`;
    await admin.db
      .update(users)
      .set({ email, emailVerifiedAt: new Date() })
      .where(eq(users.id, f.owner.id));
    const messages: { to: string; text?: string }[] = [];
    const send = vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (message) => {
      messages.push(message);
    });
    try {
      expect(
        (await request(`${path}/code`, { membershipId: f.membershipId }, f.owner)).statusCode,
      ).toBe(204);
      expect(messages[0]!.to).toBe(email);
      const proofCode = messages[0]!.text!.match(/\d{6}/)![0];
      expect(
        (await request(path, { membershipId: f.membershipId, code: proofCode }, f.owner))
          .statusCode,
      ).toBe(201);
    } finally {
      send.mockRestore();
    }
  });
  it('serializes transfers from two stores to one recipient under the one-owned-store rule', async () => {
    const recipient = await account();
    const a = await fixture(recipient);
    const b = await fixture(recipient);
    const first = await start(a);
    const second = await start(b);
    const secondSession = await app
      .get(SessionsService)
      .create(recipient.id, { isRemembered: false });
    const other = { ...recipient, cookie: `dakly_session=${secondSession.token}` };
    await request('/me/active-store', { storeId: a.storeId }, recipient);
    await request('/me/active-store', { storeId: b.storeId }, other);
    const results = await Promise.all([
      request(`${path}/accept`, { transferId: first.id }, recipient),
      request(`${path}/accept`, { transferId: second.id }, other),
    ]);
    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(
      [...(await owners(a.storeId)), ...(await owners(b.storeId))].filter(
        (id) => id === recipient.id,
      ),
    ).toHaveLength(1);
  });
  it('rechecks proof identity after consumption and never restores a spent code', async () => {
    const f = await fixture();
    const code = await proof(f);
    const [before] = await admin.db.select().from(users).where(eq(users.id, f.owner.id));
    const codes = app.get(SignInCodesService);
    const consume = codes.consume.bind(codes);
    const changed = vi.spyOn(codes, 'consume').mockImplementationOnce(async (...args) => {
      const grant = await consume(...args);
      await admin.db
        .update(users)
        .set({ phoneVerifiedAt: new Date(Date.now() + 1000) })
        .where(eq(users.id, f.owner.id));
      return grant;
    });
    try {
      expect(
        (await request(path, { membershipId: f.membershipId, code }, f.owner)).json().error.code,
      ).toBe('TRANSFER_PROOF_INVALID');
    } finally {
      changed.mockRestore();
    }
    await admin.db
      .update(users)
      .set({ phoneVerifiedAt: before!.phoneVerifiedAt })
      .where(eq(users.id, f.owner.id));
    expect(
      (await request(path, { membershipId: f.membershipId, code }, f.owner)).json().error.code,
    ).toBe('AUTH_CODE_INVALID');
    expect((await app.inject({ url: path, headers: { cookie: f.owner.cookie } })).json()).toEqual({
      transfer: null,
    });
  });
  it('rechecks Owner authority and recipient activity after proof consumption', async () => {
    for (const change of ['owner', 'recipient'] as const) {
      const f = await fixture();
      const code = await proof(f);
      const codes = app.get(SignInCodesService);
      const consume = codes.consume.bind(codes);
      const changed = vi.spyOn(codes, 'consume').mockImplementationOnce(async (...args) => {
        const grant = await consume(...args);
        await admin.db.transaction(async (tx) => {
          if (change === 'owner') {
            await tx
              .update(memberships)
              .set({ builtInRole: 'admin' })
              .where(eq(memberships.id, f.ownerMembershipId));
            await tx
              .update(memberships)
              .set({ builtInRole: 'owner' })
              .where(eq(memberships.id, f.membershipId));
          } else
            await tx
              .update(memberships)
              .set({ status: 'removed' })
              .where(eq(memberships.id, f.membershipId));
        });
        return grant;
      });
      try {
        const result = await request(path, { membershipId: f.membershipId, code }, f.owner);
        expect(result.json().error.code).toBe(
          change === 'owner' ? 'TRANSFER_DENIED' : 'TRANSFER_INVALID',
        );
        expect(await owners(f.storeId)).toHaveLength(1);
        expect(
          (
            await admin.pool.query('select id from ownership_transfers where store_id=$1', [
              f.storeId,
            ])
          ).rows,
        ).toEqual([]);
      } finally {
        changed.mockRestore();
      }
    }
  });
  it('holds the verified Owner identity stable until the transfer commits', async () => {
    const f = await fixture();
    const code = await proof(f);
    const userService = app.get(UsersService);
    const original = userService.lockVerifiedIdentity.bind(userService);
    const tenant = app.get(TenantDatabase);
    let reads = 0;
    const stable = vi
      .spyOn(userService, 'lockVerifiedIdentity')
      .mockImplementation(async (...args) => {
        const identity = await original(...args);
        // The second read belongs to the committing action, after proof consumption.
        if (++reads === 2) {
          await tenant.inTransaction(f.storeId, async () => {
            const connection = await admin.pool.connect();
            try {
              await connection.query('begin');
              await connection.query("set local lock_timeout = '100ms'");
              await expect(
                connection.query('update users set phone_verified_at=now() where id=$1', [
                  f.owner.id,
                ]),
              ).rejects.toMatchObject({ code: '55P03' });
              await connection.query('rollback');
            } finally {
              connection.release();
            }
          });
        }
        return identity;
      });
    try {
      expect(
        (await request(path, { membershipId: f.membershipId, code }, f.owner)).statusCode,
      ).toBe(201);
    } finally {
      stable.mockRestore();
    }
  });
  it('replaces expired pending rows and enforces one pending transfer in Postgres', async () => {
    const f = await fixture();
    await admin.pool.query(
      "insert into ownership_transfers (id,store_id,owner_user_id,new_owner_user_id,status,expires_at) values (gen_random_uuid(),$1,$2,$3,'pending',now()-interval '1 second')",
      [f.storeId, f.owner.id, f.member.id],
    );
    const transfer = await start(f);
    const rows = await admin.pool.query(
      'select status from ownership_transfers where store_id=$1 order by created_at',
      [f.storeId],
    );
    expect(rows.rows).toEqual([{ status: 'expired' }, { status: 'pending' }]);
    await expect(
      admin.pool.query(
        "insert into ownership_transfers (id,store_id,owner_user_id,new_owner_user_id,status,expires_at) values (gen_random_uuid(),$1,$2,$3,'pending',now()+interval '48 hours')",
        [f.storeId, f.owner.id, f.member.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (await request(`${path}/accept`, { transferId: transfer.id }, f.member)).statusCode,
    ).toBe(200);
  });
  it('rejects self, inactive recipients, unverified Owners and unrelated readers', async () => {
    const f = await fixture();
    expect(
      (await request(`${path}/code`, { membershipId: f.ownerMembershipId }, f.owner)).statusCode,
    ).toBe(400);
    expect(
      (await request(`${path}/code`, { membershipId: f.ownerMembershipId }, f.member)).statusCode,
    ).toBe(403);
    await admin.db
      .update(memberships)
      .set({ status: 'removed' })
      .where(eq(memberships.id, f.membershipId));
    expect(
      (await request(`${path}/code`, { membershipId: f.membershipId }, f.owner)).statusCode,
    ).toBe(400);
    await admin.db
      .update(memberships)
      .set({ status: 'active' })
      .where(eq(memberships.id, f.membershipId));
    await admin.db.update(users).set({ phoneVerifiedAt: null }).where(eq(users.id, f.owner.id));
    expect(
      (await request(`${path}/code`, { membershipId: f.membershipId }, f.owner)).json().error.code,
    ).toBe('TRANSFER_IDENTITY_REQUIRED');
    await admin.db
      .update(users)
      .set({ phoneVerifiedAt: new Date() })
      .where(eq(users.id, f.owner.id));
    await start(f);
    const other = await account();
    await admin.db
      .insert(memberships)
      .values({ storeId: f.storeId, userId: other.id, builtInRole: 'admin', status: 'active' });
    await request('/me/active-store', { storeId: f.storeId }, other);
    expect((await app.inject({ url: path, headers: { cookie: other.cookie } })).statusCode).toBe(
      403,
    );
  });
  it('completes all transaction reads with one pooled connection', async () => {
    const isolated = await NestFactory.create<NestFastifyApplication>(
      TestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    const connection = isolated.get<ReturnType<typeof createDatabase>>(DATABASE_CONNECTION);
    connection.pool.options.max = 1;
    connection.pool.options.connectionTimeoutMillis = 250;
    const original = app;
    try {
      await registerSessionCookies(isolated);
      isolated.useGlobalFilters(new AppErrorFilter());
      await isolated.init();
      await isolated.getHttpAdapter().getInstance().ready();
      app = isolated;
      const f = await fixture();
      const transfer = await start(f);
      expect(
        (await request(`${path}/accept`, { transferId: transfer.id }, f.member)).statusCode,
      ).toBe(200);
      expect(connection.pool.totalCount).toBe(1);
    } finally {
      app = original;
      await isolated.close();
    }
  });
});
