import 'reflect-metadata';
import { randomUUID, randomBytes, createHash, randomInt } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { TOTP, Secret } from 'otpauth';
import { hashPassword } from '../platform/crypto/password';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { createDatabase } from '@dakly/db/client';
import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { StaffSessionsService } from './staff-sessions.service';
import { StaffRepository } from './staff.repository';
import { StaffAuditRepository } from './staff-audit.repository';
import { AuditService } from '../audit/audit.service';
import { StaffHistoryService } from './staff-history.service';
import { StaffIdentityService } from './staff-identity.service';
import { SmsService } from '../sms/sms.service';
import { Clock } from '../platform/clock';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { createHttpServer } from '../platform/http/http-server';
import { registerSessionCookies, SESSION_COOKIE } from '../platform/http/session-cookie';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
class TestModule {}
Module({ imports: [DatabaseModule, AuthModule, AdminModule] })(TestModule);
const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
const actorIds: string[] = [];
const storeIds: string[] = [];
const staffIds: string[] = [];
let app: NestFastifyApplication;
let key: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let now = new Date();
const sms: string[] = [];
const adminOrigin = 'http://localhost:3010';
const shopOrigin = 'http://localhost:3000';
const digest = (token: string) => createHash('sha256').update(token).digest();
async function fixture(role = 'support') {
  const staffId = randomUUID(),
    userId = randomUUID(),
    storeId = randomUUID(),
    sessionId = randomUUID();
  staffIds.push(staffId);
  actorIds.push(userId);
  storeIds.push(storeId);
  const phone = `017${randomInt(10000000, 99999999)}`;
  const email = `${staffId}@example.test`;
  await database.pool.query(
    'insert into staff_users(id,email,name,role,access_subject,enrolled_at) values($1::uuid,$2,$3,$4,$1::text,$5)',
    [staffId, email, 'Rina', role, now],
  );
  await database.pool.query(
    'insert into users(id,name,phone,phone_verified_at) values($1,$2,$3,$4)',
    [userId, 'Owner', phone, now],
  );
  await database.pool.query('insert into stores(id,name) values($1,$2)', [storeId, 'Support shop']);
  await database.pool.query(
    "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'owner','active')",
    [storeId, userId],
  );
  const token = randomBytes(32).toString('base64url');
  await database.pool.query(
    'insert into sessions(id,token_hash,user_id,active_store_id,expires_at,last_seen_at) values($1,$2,$3,$4,$5,$6)',
    [sessionId, digest(token), userId, storeId, new Date(now.getTime() + 86400000), now],
  );
  const staffCookie = await app
    .get(StaffTransaction)
    .run(staffId, () =>
      app
        .get(StaffSessionsService)
        .issue({ id: staffId, name: 'Rina', role: role as 'support' }, '127.0.0.1'),
    );
  const assertion = await new SignJWT({ email, type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer('https://dakly-test.cloudflareaccess.com')
    .setAudience('staff-app')
    .setSubject(staffId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  return {
    ip: `2001:db8:${randomInt(1, 65535).toString(16)}::1`,
    staffId,
    userId,
    storeId,
    sessionId,
    phone,
    staffCookie: `dakly_staff=${staffCookie}`,
    ownerCookie: `${SESSION_COOKIE}=${token}`,
    assertion,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function admin(f: Fixture, url: string, body?: object) {
  return app.inject({
    remoteAddress: f.ip,
    method: body ? 'POST' : 'GET',
    url,
    headers: {
      host: 'localhost:3010',
      origin: adminOrigin,
      cookie: f.staffCookie,
      'cf-access-jwt-assertion': f.assertion,
    },
    payload: body,
  });
}
function shop(f: Fixture, url: string, body?: object, cookie = f.ownerCookie) {
  return app.inject({
    remoteAddress: f.ip,
    method: body ? 'POST' : 'GET',
    url,
    headers: { host: 'localhost:3000', origin: shopOrigin, cookie },
    payload: body,
  });
}
async function request(f: Fixture, access = 'write', durationMinutes = 30) {
  const response = await admin(f, '/admin/support', {
    targetId: f.storeId,
    reason: 'Investigate customer issue',
    access,
    scopes: ['customers'],
    durationMinutes,
  });
  expect(response.statusCode, response.body).toBe(201);
  expect(response.json().codeSent).toBe(true);
  return response.json().id as string;
}
async function approve(f: Fixture, id: string) {
  const code = sms.at(-1)!.match(/\b\d{6}\b/)![0];
  const approved = await shop(f, `/support-access/${id}/approve`, { code });
  expect(approved.statusCode, approved.body).toBe(201);
  return code;
}
async function open(f: Fixture, id: string) {
  const handoff = await admin(f, `/admin/support/${id}/handoff`, {});
  expect(handoff.statusCode, handoff.body).toBe(201);
  const exchange = await app.inject({
    method: 'POST',
    url: '/support/exchange',
    headers: {
      host: 'localhost:3000',
      origin: adminOrigin,
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: `token=${handoff.json().token}`,
  });
  expect(exchange.statusCode, exchange.body).toBe(303);
  expect(exchange.headers['set-cookie']).toContain('Path=/support;');
  return {
    cookie: String(exchange.headers['set-cookie']).split(';')[0]!,
    token: handoff.json().token as string,
  };
}
async function beginSignInAgain(f: Fixture) {
  const password = 'support-continuation123';
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const envelope = app
    .get(EnvelopeEncryption)
    .encrypt({ owner: 'staff', staffUserId: f.staffId, purpose: 'totp' }, Buffer.from(secret));
  await database.pool.query(
    'update staff_users set password_hash=$2,totp_secret_ciphertext=$3,totp_key_version=$4 where id=$1',
    [f.staffId, await hashPassword(password), envelope.ciphertext, envelope.keyVersion],
  );
  const begin = await admin(f, '/admin/auth/sign-in', {
    email: `${f.staffId}@example.test`,
    password,
  });
  expect(begin.statusCode, begin.body).toBe(200);
  return begin.json().challenge as string;
}
async function finishSignIn(f: Fixture, challenge: string) {
  const finish = await admin(f, '/admin/auth/totp', {
    challenge,
    code: new TOTP({ secret: Secret.fromBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ') }).generate({
      timestamp: now.getTime(),
    }),
  });
  expect(finish.statusCode, finish.body).toBe(204);
  return { ...f, staffCookie: String(finish.headers['set-cookie']).split(';')[0]! };
}
async function signInAgain(f: Fixture) {
  return finishSignIn(f, await beginSignInAgain(f));
}
async function waitForBlockedTransactions(pid: number, total: number) {
  await expect
    .poll(async () =>
      Number(
        (
          await database.pool.query(
            `with recursive blocked(pid) as (select $1::int union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(*)-1 as total from blocked`,
            [pid],
          )
        ).rows[0].total,
      ),
    )
    .toBe(total);
}
async function parentState(f: Fixture) {
  return (
    await database.pool.query(
      'select id,last_seen_at,expires_at,revoked_at from staff_sessions where staff_user_id=$1 order by created_at desc',
      [f.staffId],
    )
  ).rows;
}
async function addCustomer(f: Fixture, cookie: string) {
  const response = await shop(
    f,
    '/support/customers',
    {
      name: 'Support activity',
      phone: `018${randomInt(10000000, 99999999)}`,
    },
    cookie,
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id as string;
}
async function exchangeProof(token: string) {
  return app.inject({
    method: 'POST',
    url: '/support/exchange',
    headers: {
      host: 'localhost:3000',
      origin: adminOrigin,
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: `token=${token}`,
  });
}
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  vi.stubEnv('ADMIN_ORIGIN', adminOrigin);
  vi.stubEnv('WEB_ORIGINS', shopOrigin);
  vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly-test.cloudflareaccess.com');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
  vi.stubEnv(
    'CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS',
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'fixture' }] }),
  );
  vi.stubEnv('STAFF_SESSION_SIGNING_KEY', randomBytes(32).toString('base64'));
  app = await NestFactory.create<NestFastifyApplication>(
    TestModule,
    new FastifyAdapter(createHttpServer([])),
    { logger: false, abortOnError: false },
  );
  await registerSessionCookies(app);
  app.useGlobalFilters(new AppErrorFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  vi.spyOn(Clock.prototype, 'now').mockImplementation(() => now);
  vi.spyOn(SmsService.prototype, 'send').mockImplementation(async (message) => {
    sms.push(message.text);
  });
});
afterEach(() => {
  now = new Date();
});
afterAll(async () => {
  for (const table of [
    'support_sessions',
    'support_grants',
    'customers',
    'audit_log',
    'memberships',
  ])
    await database.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [storeIds]);
  await database.pool.query('delete from sessions where user_id=any($1::uuid[])', [actorIds]);
  for (const table of [
    'staff_identity_contacts',
    'staff_user_links',
    'staff_audit_exports',
    'staff_audit_log',
    'staff_challenges',
    'staff_sessions',
  ])
    await database.pool.query(`delete from ${table} where staff_user_id=any($1::uuid[])`, [
      staffIds,
    ]);
  await database.pool.query('delete from staff_audit_log where actor_user_id=any($1::uuid[])', [
    actorIds,
  ]);
  await database.pool.query('delete from staff_users where id=any($1::uuid[])', [staffIds]);
  await database.pool.query('delete from users where id=any($1::uuid[])', [actorIds]);
  await database.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
  await database.pool.end();
  await app?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('Owner-approved support through Fastify and app-role PostgreSQL', () => {
  it('requires current Owner/session and request-bound one-use SMS proof, truthfully attributes consent', async () => {
    const f = await fixture();
    const id = await request(f);
    const other = await fixture();
    expect((await shop(other, `/support-access/${id}/code`, {})).statusCode).toBe(404);
    await database.pool.query("update memberships set built_in_role='admin' where user_id=$1", [
      f.userId,
    ]);
    expect((await shop(f, `/support-access/${id}/code`, {})).statusCode).toBe(403);
    await database.pool.query("update memberships set built_in_role='owner' where user_id=$1", [
      f.userId,
    ]);
    expect((await shop(f, `/support-access/${id}/approve`, { code: '999999' })).statusCode).toBe(
      400,
    );
    const code = await approve(f, id);
    expect((await shop(f, `/support-access/${id}/approve`, { code })).statusCode).toBe(409);
    const rows = await database.pool.query(
      "select staff_user_id,actor_user_id from staff_audit_log where target_id=$1 and action='support.approved'",
      [id],
    );
    expect(rows.rows).toEqual([{ staff_user_id: null, actor_user_id: f.userId }]);
  });
  it('isolates handoff/session from shop cookies and logs read-only write denial in both audits', async () => {
    const f = await fixture();
    const id = await request(f, 'read');
    await approve(f, id);
    const session = await open(f, id);
    expect((await shop(f, '/support/session')).statusCode).toBe(403);
    expect(
      (
        await shop(
          f,
          '/customers',
          { name: 'Not allowed', phone: `018${randomInt(10000000, 99999999)}` },
          session.cookie,
        )
      ).statusCode,
    ).toBe(401);
    const denied = await shop(
      f,
      '/support/customers',
      { name: 'Not allowed', phone: `018${randomInt(10000000, 99999999)}` },
      session.cookie,
    );
    expect(denied.statusCode, denied.body).toBe(403);
    for (const table of ['audit_log', 'staff_audit_log'])
      expect(
        (
          await database.pool.query(
            `select count(*)::int as total from ${table} where store_id=$1 and action='support.action_denied'`,
            [f.storeId],
          )
        ).rows[0].total,
      ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/support/exchange',
          headers: { host: 'localhost:3000', origin: adminOrigin },
          payload: { token: session.token },
        })
      ).statusCode,
    ).toBe(403);
    expect((await shop(f, '/support-access')).statusCode).toBe(200);
  });
  it('creates through the existing customer service and rolls back when either audit fails', async () => {
    const f = await fixture();
    const id = await request(f);
    await approve(f, id);
    const { cookie } = await open(f, id);
    const originalParent = await parentState(f);
    for (const repository of [app.get(StaffAuditRepository), app.get(AuditService)]) {
      now = new Date(now.getTime() + 60000);
      const method = repository instanceof StaffAuditRepository ? 'recordForStore' : 'record';
      const spy = vi
        .spyOn(repository as StaffAuditRepository & AuditService, method)
        .mockRejectedValueOnce(new Error('audit unavailable'));
      const phone = `018${randomInt(10000000, 99999999)}`;
      expect(
        (await shop(f, '/support/customers', { name: 'Rollback', phone }, cookie)).statusCode,
      ).toBe(500);
      spy.mockRestore();
      expect(await parentState(f)).toEqual(originalParent);
      expect(
        (
          await database.pool.query('select id from customers where store_id=$1 and phone=$2', [
            f.storeId,
            phone,
          ])
        ).rows,
      ).toEqual([]);
    }
    const created = await shop(
      f,
      '/support/customers',
      { name: 'Customer', phone: `018${randomInt(10000000, 99999999)}` },
      cookie,
    );
    expect(created.statusCode, created.body).toBe(201);
    const events = await database.pool.query(
      "select actor_type,actor_staff_id from audit_log where store_id=$1 and action='support.customer_created'",
      [f.storeId],
    );
    expect(events.rows).toEqual([{ actor_type: 'staff', actor_staff_id: f.staffId }]);
    const other = await fixture();
    const otherCustomer = randomUUID();
    await database.pool.query('insert into customers(id,store_id,name,phone) values($1,$2,$3,$4)', [
      otherCustomer,
      other.storeId,
      'Other',
      `019${randomInt(10000000, 99999999)}`,
    ]);
    expect(
      (await shop(f, `/support/customers/${otherCustomer}`, undefined, cookie)).statusCode,
    ).toBe(404);
  });
  it('ends on the next request after Owner end, expiry, parent revocation or staff disable', async () => {
    for (const ending of ['owner', 'expiry', 'revoke', 'disable']) {
      const f = await fixture();
      const id = await request(f);
      await approve(f, id);
      const { cookie } = await open(f, id);
      if (ending === 'owner')
        expect((await shop(f, `/support-access/${id}/end`, {})).statusCode).toBe(201);
      if (ending === 'expiry') now = new Date(now.getTime() + 1800001);
      if (ending === 'revoke')
        await database.pool.query(
          'update staff_sessions set revoked_at=now() where staff_user_id=$1',
          [f.staffId],
        );
      if (ending === 'disable')
        await database.pool.query("update staff_users set status='disabled' where id=$1", [
          f.staffId,
        ]);
      expect((await shop(f, '/support/session', undefined, cookie)).statusCode).toBe(403);
      now = new Date();
    }
  });
  it('expires unanswered requests, rejects unsupported scopes/roles and serializes approval versus end', async () => {
    const f = await fixture();
    const id = await request(f);
    now = new Date(now.getTime() + 1800001);
    expect((await shop(f, `/support-access/${id}/code`, {})).statusCode).toBe(409);
    now = new Date();
    const finance = await fixture('finance');
    expect(
      (
        await admin(finance, '/admin/support', {
          targetId: finance.storeId,
          reason: 'Needs customer support',
          access: 'read',
          scopes: ['customers'],
          durationMinutes: 30,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await admin(f, '/admin/support', {
          targetId: f.storeId,
          reason: 'Needs customer support',
          access: 'write',
          scopes: ['billing'],
          durationMinutes: 30,
        })
      ).statusCode,
    ).toBe(400);
    const g = await fixture();
    const pending = await request(g);
    const code = sms.at(-1)!.match(/\b\d{6}\b/)![0];
    const results = await Promise.all([
      shop(g, `/support-access/${pending}/approve`, { code }),
      shop(g, `/support-access/${pending}/deny`, {}),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  });
  it('preserves verified staff-user associations across contact changes and rejects known own stores', async () => {
    const f = await fixture();
    await database.pool.query(
      "insert into staff_identity_contacts(id,staff_user_id,kind,value) values(gen_random_uuid(),$1,'phone',$2)",
      [f.staffId, f.phone],
    );
    expect(await app.get(StaffIdentityService).isLinkedUser(f.staffId, f.userId)).toBe(true);
    await database.pool.query('update users set phone=$2 where id=$1', [
      f.userId,
      `019${randomInt(10000000, 99999999)}`,
    ]);
    expect(
      (
        await admin(f, '/admin/support', {
          targetId: f.storeId,
          reason: 'Needs customer support',
          access: 'read',
          scopes: ['customers'],
          durationMinutes: 30,
        })
      ).statusCode,
    ).toBe(403);
    expect(await app.get(StaffIdentityService).isLinkedUser(f.staffId, f.userId)).toBe(true);
  });
  it('rejects codes for another request, expired codes, and proof reused after audit rollback', async () => {
    const f = await fixture();
    const id = await request(f);
    const code = sms.at(-1)!.match(/\b\d{6}\b/)![0];
    const second = await admin(f, '/admin/support', {
      targetId: f.storeId,
      reason: 'Another customer support issue',
      access: 'write',
      scopes: ['customers'],
      durationMinutes: 30,
    });
    expect(second.statusCode).toBe(201);
    expect(
      (await shop(f, `/support-access/${second.json().id}/approve`, { code })).statusCode,
    ).toBe(400);
    const failure = vi
      .spyOn(app.get(StaffAuditRepository), 'recordForStore')
      .mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await shop(f, `/support-access/${id}/approve`, { code })).statusCode).toBe(500);
    failure.mockRestore();
    expect((await shop(f, `/support-access/${id}/approve`, { code })).statusCode).toBe(400);
    expect(
      (await database.pool.query('select status from support_grants where id=$1', [id])).rows[0]
        .status,
    ).toBe('requested');
    const expired = await fixture();
    const pending = await request(expired);
    const expiredCode = sms.at(-1)!.match(/\b\d{6}\b/)![0];
    const identity = await database.pool.query('select phone_verified_at from users where id=$1', [
      expired.userId,
    ]);
    const binding = JSON.stringify([
      expired.storeId,
      pending,
      expired.userId,
      expired.phone,
      identity.rows[0].phone_verified_at.toISOString(),
      'write',
      ['customers'],
      30,
    ]);
    const key =
      'auth:code:support_approval:' +
      digest(JSON.stringify([expired.phone, binding])).toString('hex');
    const redis = app.get(ValkeyClient).connection;
    expect(await redis.exists(key)).toBe(1);
    await redis.pexpire(key, 1);
    await expect.poll(() => redis.exists(key)).toBe(0);
    expect(
      (await shop(expired, `/support-access/${pending}/approve`, { code: expiredCode })).statusCode,
    ).toBe(400);
  });
  it('rechecks grant scope and never refreshes parent idle time from support heartbeat', async () => {
    const f = await fixture();
    const id = await request(f);
    await approve(f, id);
    const { cookie } = await open(f, id);
    const before = await database.pool.query(
      'select last_seen_at from staff_sessions where staff_user_id=$1',
      [f.staffId],
    );
    await shop(f, '/support/session', undefined, cookie);
    expect(
      (
        await database.pool.query(
          'select last_seen_at from staff_sessions where staff_user_id=$1',
          [f.staffId],
        )
      ).rows,
    ).toEqual(before.rows);
    await database.pool.query("update support_grants set scopes='{}' where id=$1", [id]);
    expect(
      (
        await shop(
          f,
          '/support/customers',
          { name: 'Denied', phone: `018${randomInt(10000000, 99999999)}` },
          cookie,
        )
      ).statusCode,
    ).toBe(403);
  });
  it('keeps genuine audited customer work active beyond thirty minutes without extending absolute expiry', async () => {
    const f = await fixture();
    const id = await request(f, 'write', 1440);
    await approve(f, id);
    const { cookie } = await open(f, id);
    const started = now.getTime();
    const initial = (await parentState(f))[0];
    now = new Date(started + 20 * 60000);
    const customerId = await addCustomer(f, cookie);
    expect((await parentState(f))[0].last_seen_at).toEqual(now);
    // Actual reads keep a long working session alive; no admin request or heartbeat touches it.
    for (let minutes = 40; minutes < 480; minutes += 20) {
      now = new Date(started + minutes * 60000);
      expect(
        (await shop(f, `/support/customers/${customerId}`, undefined, cookie)).statusCode,
      ).toBe(200);
      expect((await parentState(f))[0].last_seen_at).toEqual(now);
    }
    expect((await parentState(f))[0].expires_at).toEqual(initial.expires_at);
    now = new Date(started + 480 * 60000);
    expect((await shop(f, `/support/customers/${customerId}`, undefined, cookie)).statusCode).toBe(
      403,
    );
    const fresh = await signInAgain(f);
    const resumed = await open(fresh, id);
    expect(
      (await shop(fresh, `/support/customers/${customerId}`, undefined, resumed.cookie)).statusCode,
    ).toBe(200);
    expect((await shop(f, '/support/session', undefined, cookie)).statusCode).toBe(403);
  });
  it('expires heartbeat-only sessions and failed or denied work without restoring idle parents', async () => {
    const f = await fixture();
    const id = await request(f, 'read', 120);
    await approve(f, id);
    const { cookie } = await open(f, id);
    const initial = await parentState(f);
    const started = now.getTime();
    now = new Date(started + 20 * 60000);
    expect((await shop(f, '/support/session', undefined, cookie)).statusCode).toBe(200);
    expect(
      (await shop(f, `/support/customers/${randomUUID()}`, undefined, cookie)).statusCode,
    ).toBe(404);
    expect(
      (await shop(f, '/support/customers', { name: 'Denied', phone: '01812345678' }, cookie))
        .statusCode,
    ).toBe(403);
    expect(await parentState(f)).toEqual(initial);
    now = new Date(started + 30 * 60000);
    expect((await shop(f, '/support/session', undefined, cookie)).statusCode).toBe(403);
    expect(await parentState(f)).toEqual(initial);
    const fresh = await signInAgain(f);
    expect(
      (await shop(fresh, '/support/session', undefined, (await open(fresh, id)).cookie)).statusCode,
    ).toBe(200);
  });
  it('continues remaining approval only through a fresh parent and rejects old handoffs and tokens after revocation', async () => {
    const f = await fixture();
    const id = await request(f, 'write', 120);
    await approve(f, id);
    const { cookie } = await open(f, id);
    const unconsumed = await admin(f, `/admin/support/${id}/handoff`, {});
    now = new Date(now.getTime() + 1000);
    const fresh = await signInAgain(f);
    expect((await shop(f, '/support/session', undefined, cookie)).statusCode).toBe(403);
    expect((await exchangeProof(unconsumed.json().token)).statusCode).toBe(403);
    expect((await admin(f, `/admin/support/${id}/handoff`, {})).statusCode).toBe(401);
    const resumed = await open(fresh, id);
    await addCustomer(fresh, resumed.cookie);
    expect(
      (await parentState(f)).find((row) => row.revoked_at)?.last_seen_at.getTime(),
    ).toBeLessThan(now.getTime());
    await database.pool.query("update staff_users set role='finance' where id=$1", [f.staffId]);
    expect((await admin(fresh, `/admin/support/${id}/handoff`, {})).statusCode).toBe(403);
    await database.pool.query("update staff_users set role='support' where id=$1", [f.staffId]);
    await database.pool.query(
      "insert into staff_identity_contacts(id,staff_user_id,kind,value) values(gen_random_uuid(),$1,'phone',$2)",
      [f.staffId, f.phone],
    );
    expect((await admin(fresh, `/admin/support/${id}/handoff`, {})).statusCode).toBe(403);
    expect((await shop(fresh, '/support/session', undefined, resumed.cookie)).statusCode).toBe(403);
  });
  it('never reopens expired, Owner-ended or disabled-then-reenabled grants on a new sign-in', async () => {
    for (const ending of ['expiry', 'owner', 'disable']) {
      const f = await fixture();
      const id = await request(f, 'write', 120);
      await approve(f, id);
      const { cookie } = await open(f, id);
      if (ending === 'expiry') now = new Date(now.getTime() + 120 * 60000);
      if (ending === 'owner')
        expect((await shop(f, `/support-access/${id}/end`, {})).statusCode).toBe(201);
      if (ending === 'disable') {
        await app
          .get(StaffTransaction)
          .run(f.staffId, () => app.get(StaffRepository).update(f.staffId, { status: 'disabled' }));
        const grant = (
          await database.pool.query('select status,ended_at from support_grants where id=$1', [id])
        ).rows[0];
        expect(grant.status).toBe('ended');
        expect(grant.ended_at).toBeInstanceOf(Date);
        await database.pool.query("update staff_users set status='active' where id=$1", [
          f.staffId,
        ]);
      }
      now = new Date(now.getTime() + 1);
      const fresh = await signInAgain(f);
      expect((await admin(fresh, `/admin/support/${id}/handoff`, {})).statusCode).toBe(403);
      expect((await shop(f, '/support/session', undefined, cookie)).statusCode).toBe(403);
      now = new Date();
    }
  });
  it('serializes concurrent Owner end, new sign-in and activity without restoring access', async () => {
    const f = await fixture();
    const id = await request(f, 'write', 120);
    await approve(f, id);
    const { cookie } = await open(f, id);
    const customerId = await addCustomer(f, cookie);
    now = new Date(now.getTime() + 60000);
    const challenge = await beginSignInAgain(f);
    const holder = await database.pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select id from staff_users where id=$1 for update', [f.staffId]);
      const pid = (await holder.query('select pg_backend_pid() as pid')).rows[0].pid;
      const activity = shop(f, `/support/customers/${customerId}`, undefined, cookie).then(
        (result) => result,
      );
      const signingIn = finishSignIn(f, challenge);
      await waitForBlockedTransactions(pid, 2);
      const ending = shop(f, `/support-access/${id}/end`, {}).then((result) => result);
      await waitForBlockedTransactions(pid, 3);
      await holder.query('commit');
      const [ended, fresh, result] = await Promise.all([ending, signingIn, activity]);
      expect(ended.statusCode, ended.body).toBe(201);
      expect([200, 403]).toContain(result.statusCode);
      expect((await admin(fresh, `/admin/support/${id}/handoff`, {})).statusCode).toBe(403);
      expect((await shop(f, '/support/session', undefined, cookie)).statusCode).toBe(403);
      expect(
        (await database.pool.query('select status from support_grants where id=$1', [id])).rows[0]
          .status,
      ).toBe('ended');
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  });
  it('does not overwrite a requested grant ended by disable while approval waits for the staff lock', async () => {
    const f = await fixture();
    const id = await request(f);
    const code = sms.at(-1)!.match(/\b\d{6}\b/)![0];
    const holder = await database.pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select id from staff_users where id=$1 for update', [f.staffId]);
      const pid = (await holder.query('select pg_backend_pid() as pid')).rows[0].pid;
      const approval = shop(f, `/support-access/${id}/approve`, { code }).then((result) => result);
      await expect
        .poll(
          async () =>
            (
              await database.pool.query(
                'select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) as blocked',
                [pid],
              )
            ).rows[0].blocked,
        )
        .toBe(true);
      await holder.query("update staff_users set status='disabled' where id=$1", [f.staffId]);
      await holder.query("update staff_users set status='active' where id=$1", [f.staffId]);
      await holder.query('commit');
      const result = await approval;
      expect(result.statusCode, result.body).toBe(409);
      expect(
        (await database.pool.query('select status from support_grants where id=$1', [id])).rows[0]
          .status,
      ).toBe('ended');
      const fresh = await signInAgain(f);
      expect((await admin(fresh, `/admin/support/${id}/handoff`, {})).statusCode).toBe(403);
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  });
  it('rejects support and admin requests when idle or absolute expiry passes while waiting for locks', async () => {
    for (const expiry of ['idle', 'absolute']) {
      const f = await fixture();
      const id = await request(f, 'write', 1440);
      await approve(f, id);
      const { cookie } = await open(f, id);
      const customerId = await addCustomer(f, cookie);
      const started = now.getTime();
      if (expiry === 'absolute') {
        now = new Date(started + 479 * 60000);
        await database.pool.query(
          'update staff_sessions set last_seen_at=$2 where staff_user_id=$1',
          [f.staffId, now],
        );
      } else now = new Date(started + 29 * 60000);
      const initial = await parentState(f);
      const holder = await database.pool.connect();
      try {
        await holder.query('begin');
        await holder.query('select id from staff_users where id=$1 for update', [f.staffId]);
        const pid = (await holder.query('select pg_backend_pid() as pid')).rows[0].pid;
        const work = shop(f, `/support/customers/${customerId}`, undefined, cookie).then(
          (result) => result,
        );
        const adminRequest = admin(f, '/admin/auth/session').then((result) => result);
        await waitForBlockedTransactions(pid, 2);
        now = new Date(started + (expiry === 'absolute' ? 480 : 30) * 60000);
        await holder.query('commit');
        expect((await work).statusCode).toBe(403);
        expect((await adminRequest).statusCode).toBe(401);
        expect(await parentState(f)).toEqual(initial);
      } finally {
        await holder.query('rollback');
        holder.release();
      }
      now = new Date();
    }
  });
  it('serializes activity for one parent across stores and never moves last-seen time backwards', async () => {
    const f = await fixture();
    const first = await request(f, 'write', 120);
    await approve(f, first);
    const firstSession = await open(f, first);
    const other = await fixture();
    const second = await request({ ...f, storeId: other.storeId }, 'write', 120);
    await approve(other, second);
    const secondSession = await open(f, second);
    now = new Date(now.getTime() + 60000);
    await Promise.all([addCustomer(f, firstSession.cookie), addCustomer(f, secondSession.cookie)]);
    const latest = await parentState(f);
    now = new Date(now.getTime() - 30000);
    await addCustomer(f, firstSession.cookie);
    expect((await admin(f, '/admin/auth/session')).statusCode).toBe(200);
    expect(await parentState(f)).toEqual(latest);
  });
  it('allows Owner consent after fresh sign-in without binding it to the requesting parent', async () => {
    const f = await fixture();
    const id = await request(f, 'read', 120);
    now = new Date(now.getTime() + 1000);
    const fresh = await signInAgain(f);
    await approve(f, id);
    expect(
      (await shop(fresh, '/support/session', undefined, (await open(fresh, id)).cookie)).statusCode,
    ).toBe(200);
  });
  it('rolls customer writes and both audits back if idle expiry passes during audit lock wait', async () => {
    const f = await fixture();
    const id = await request(f, 'write', 120);
    await approve(f, id);
    const { cookie } = await open(f, id);
    const initial = await parentState(f);
    const phone = `018${randomInt(10000000, 99999999)}`;
    const holder = await database.pool.connect();
    try {
      await holder.query('begin');
      await holder.query(
        "select pg_advisory_xact_lock(41202, (clock_timestamp() at time zone 'UTC')::date - date '2000-01-01')",
      );
      const pid = (await holder.query('select pg_backend_pid() as pid')).rows[0].pid;
      const activity = shop(f, '/support/customers', { name: 'Expired work', phone }, cookie).then(
        (result) => result,
      );
      await expect
        .poll(
          async () =>
            (
              await database.pool.query(
                'select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) as blocked',
                [pid],
              )
            ).rows[0].blocked,
        )
        .toBe(true);
      now = new Date(now.getTime() + 30 * 60000);
      await holder.query('commit');
      expect((await activity).statusCode).toBe(403);
      expect(await parentState(f)).toEqual(initial);
      expect(
        (
          await database.pool.query('select id from customers where store_id=$1 and phone=$2', [
            f.storeId,
            phone,
          ])
        ).rows,
      ).toEqual([]);
      for (const table of ['audit_log', 'staff_audit_log'])
        expect(
          (
            await database.pool.query(
              `select id from ${table} where store_id=$1 and action='support.customer_created'`,
              [f.storeId],
            )
          ).rows,
        ).toEqual([]);
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  });
  it('rejects exports over one thousand matching rows without partial artifact content', async () => {
    const f = await fixture('super_admin');
    await database.pool.query(
      "insert into staff_audit_log(id,staff_user_id,action,reason) select gen_random_uuid(),$1,'fixture.export_limit','Bounded export test fixture' from generate_series(1,1001)",
      [f.staffId],
    );
    const issued = await admin(f, '/admin/audit/exports', {
      filter: { staffUserId: f.staffId, action: 'fixture.export_limit' },
      reason: 'Review bounded export limit',
    });
    expect(issued.statusCode).toBe(201);
    await app.get(StaffHistoryService).build(issued.json().id);
    const status = await admin(f, `/admin/audit/exports/${issued.json().id}`);
    expect(status.json()).toMatchObject({ status: 'failed', progress: 100 });
    expect(status.json().error).toContain('Narrow the filters');
    expect((await admin(f, `/admin/audit/exports/${issued.json().id}/download`)).statusCode).toBe(
      404,
    );
  });
  it('makes bounded expiring exports only available to the requesting current Super admin', async () => {
    const f = await fixture('super_admin');
    const issued = await admin(f, '/admin/audit/exports', {
      filter: { staffUserId: f.staffId },
      reason: 'Review staff audit activity',
    });
    expect(issued.statusCode, issued.body).toBe(201);
    const id = issued.json().id;
    await app.get(StaffHistoryService).build(id);
    const downloaded = await admin(f, `/admin/audit/exports/${id}/download`);
    expect(downloaded.statusCode, downloaded.body).toBe(200);
    expect(downloaded.body).toContain('"Exported by","Rina"');
    const other = await fixture('super_admin');
    expect((await admin(other, `/admin/audit/exports/${id}/download`)).statusCode).toBe(404);
    await database.pool.query(
      "update staff_audit_exports set expires_at=now()-interval '1 second' where id=$1",
      [id],
    );
    expect((await admin(f, `/admin/audit/exports/${id}/download`)).statusCode).toBe(404);
    expect(
      (await admin(f, '/admin/audit?action=%27%3Bdrop%20table%20users%3B--')).json().rows,
    ).toEqual([]);
  });
});
