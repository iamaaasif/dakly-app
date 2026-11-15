import 'reflect-metadata';

import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { TOTP, Secret } from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { StaffRecoveryPreview, StaffRecoveryRequest } from '@dakly/contracts/staff-recovery';
import { createDatabase } from '@dakly/db/client';

import { AuthModule } from '../auth/auth.module';
import { SecurityNoticesService } from '../auth/security-notices.service';
import { SignInCodesService } from '../auth/sign-in-codes.service';
import { UsersService } from '../auth/users.service';
import { EmailService } from '../email/email.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { AccountDatabase } from '../platform/database/account-database';
import { DatabaseModule } from '../platform/database/database.module';
import { newId } from '../platform/database/new-id';
import { StaffDatabase } from '../platform/database/staff-database';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { createHttpServer } from '../platform/http/http-server';
import { registerSessionCookies, SESSION_COOKIE } from '../platform/http/session-cookie';
import { SessionsService } from '../sessions/sessions.service';
import { SmsService } from '../sms/sms.service';
import { StoresModule } from '../stores/stores.module';
import { AdminModule } from './admin.module';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffRecoveryRepository } from './staff-recovery.repository';
import { StaffSessionsService } from './staff-sessions.service';
import { StaffRepository } from './staff.repository';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule, AdminModule, StoresModule] })(TestModule);
const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
const userIds: string[] = [],
  storeIds: string[] = [],
  staffIds: string[] = [];
const delivered: { to: string; text: string }[] = [];
let app: NestFastifyApplication;
let key: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
const phone = () => `017${randomInt(10000000, 99999999)}`;
async function user(disabled = false) {
  const id = randomUUID();
  userIds.push(id);
  const contact = { id, phone: phone(), email: `${id}@example.test` };
  await database.pool.query(
    "insert into users(id,name,phone,phone_verified_at,email,email_verified_at,totp_enabled_at,backup_code_hashes,is_disabled) values($1,$2,$3,now(),$4,now(),now(),array['old-backup'],$5)",
    [id, 'রিনা', contact.phone, contact.email, disabled],
  );
  return contact;
}
async function store(ownerId: string, memberId?: string) {
  const id = randomUUID();
  storeIds.push(id);
  await database.pool.query('insert into stores(id,name) values($1,$2)', [
    id,
    'Recovery test shop',
  ]);
  await database.pool.query(
    "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'owner','active')",
    [id, ownerId],
  );
  if (memberId)
    await database.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'admin','active')",
      [id, memberId],
    );
  return id;
}
async function session(userId: string, storeId?: string) {
  const result = await app.get(SessionsService).create(userId, { isRemembered: false });
  if (storeId)
    await database.pool.query('update sessions set active_store_id=$2 where id=$1', [
      result.session.id,
      storeId,
    ]);
  return `${SESSION_COOKIE}=${result.token}`;
}
async function fixture(role: 'support' | 'super_admin' | 'finance' = 'support', withStore = true) {
  const person = await user();
  const storeId = withStore ? await store(person.id) : undefined;
  const staffId = randomUUID();
  staffIds.push(staffId);
  const email = `${staffId}@example.test`;
  await database.pool.query(
    'insert into staff_users(id,name,email,role,access_subject,enrolled_at) values($1::uuid,$2,$3,$4,$1::text,now())',
    [staffId, 'Support tester', email, role],
  );
  const token = await app
    .get(StaffTransaction)
    .run(staffId, () =>
      app
        .get(StaffSessionsService)
        .issue({ id: staffId, name: 'Support tester', role }, '127.0.0.1'),
    );
  const assertion = await new SignJWT({ email, type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'recovery' })
    .setIssuer('https://dakly-test.cloudflareaccess.com')
    .setAudience('staff-app')
    .setSubject(staffId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const cookies = await Promise.all([session(person.id, storeId), session(person.id, storeId)]);
  return {
    ...person,
    storeId,
    staffId,
    cookies,
    headers: {
      host: 'localhost:3010',
      origin: 'http://localhost:3010',
      cookie: `dakly_staff=${token}`,
      'cf-access-jwt-assertion': assertion,
    },
    ip: `2001:db8:${randomInt(1, 65535).toString(16)}::1`,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const input = (f: Fixture): StaffRecoveryRequest => ({
  targetId: f.id,
  reasonType: 'lost_authenticator',
  reason: 'Identity matched during support callback',
  checks: { nidLastFourMatched: true, storeDetailsMatched: true, oldNumberCallbackAttempted: true },
  removeTotp: true,
});
function admin(f: Fixture, path: string, payload: object) {
  return app.inject({
    method: 'POST',
    url: `/admin/account-recovery${path}`,
    headers: f.headers,
    remoteAddress: f.ip,
    payload,
  });
}
function shop(cookie: string, path: string) {
  return app.inject({
    method: 'GET',
    url: path,
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie },
  });
}
async function preview(f: Fixture, changes: Partial<StaffRecoveryRequest> = {}) {
  const response = await admin(f, '/preview', { ...input(f), ...changes });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<StaffRecoveryPreview>();
}
async function proof(f: Fixture, p: StaffRecoveryPreview, channel: 'phone' | 'email') {
  const response = await admin(f, '/code', { ...p, channel });
  expect(response.statusCode, response.body).toBe(204);
  // Without a replacement contact, the code goes to the fixture's current verified contact.
  const target =
    channel === 'phone' ? (p.effect.newPhone ?? f.phone) : (p.effect.newEmail ?? f.email);
  return delivered
    .filter((message) => message.to === target)
    .at(-1)!
    .text.match(/\b\d{6}\b/)![0];
}
function pauseAfterProof() {
  const codes = app.get(SignInCodesService),
    original = codes.consume.bind(codes);
  let resume!: () => void, proved!: () => void;
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const consumed = new Promise<void>((resolve) => {
    proved = resolve;
  });
  const spy = vi.spyOn(codes, 'consume').mockImplementationOnce(async (...args) => {
    const grant = await original(...args);
    proved();
    await resumed;
    return grant;
  });
  return { consumed, resume, restore: () => spy.mockRestore() };
}
async function state(id: string) {
  return (
    await database.pool.query(
      'select phone,email,totp_enabled_at,backup_code_hashes,security_version from users where id=$1',
      [id],
    )
  ).rows[0];
}
async function recoveryRows(id: string) {
  return (
    await database.pool.query(
      "select (select count(*)::int from staff_audit_log where target_id=$1 and action='account.recovered') audits,(select count(*)::int from account_security_events where user_id=$1) events,(select count(*)::int from account_security_notices where user_id=$1) notices,(select count(*)::int from staff_recovery_history h join staff_audit_log a on a.id=h.audit_id where a.target_id=$1) history",
      [id],
    )
  ).rows[0];
}
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  vi.stubEnv('ADMIN_ORIGIN', 'http://localhost:3010');
  vi.stubEnv('WEB_ORIGINS', 'http://localhost:3000');
  vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly-test.cloudflareaccess.com');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
  vi.stubEnv(
    'CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS',
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'recovery' }] }),
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
  vi.spyOn(SmsService.prototype, 'send').mockImplementation(async (message) => {
    delivered.push(message);
  });
  vi.spyOn(EmailService.prototype, 'send').mockImplementation(async (message) => {
    delivered.push(message);
  });
});
afterAll(async () => {
  await database.pool.query(
    'delete from staff_recovery_history where audit_id in (select id from staff_audit_log where target_id=any($1::uuid[]))',
    [userIds],
  );
  await database.pool.query('delete from account_security_events where user_id=any($1::uuid[])', [
    userIds,
  ]);
  for (const table of ['audit_log', 'subscriptions', 'store_counters'])
    await database.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [storeIds]);
  await database.pool.query('delete from memberships where store_id=any($1::uuid[])', [storeIds]);
  await database.pool.query('delete from sessions where user_id=any($1::uuid[])', [userIds]);
  for (const table of [
    'staff_identity_contacts',
    'staff_user_links',
    'staff_audit_log',
    'staff_sessions',
  ])
    await database.pool.query(`delete from ${table} where staff_user_id=any($1::uuid[])`, [
      staffIds,
    ]);
  await database.pool.query('delete from users where id=any($1::uuid[])', [userIds]);
  await database.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
  await database.pool.query('delete from staff_users where id=any($1::uuid[])', [staffIds]);
  await database.pool.end();
  await app?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('Staff account recovery over Fastify and Postgres', () => {
  it('resolves only exact verified contacts for an authorized support identity', async () => {
    const f = await fixture(),
      finance = await fixture('finance');
    const found = await admin(f, '/lookup', { identifier: f.phone });
    expect(found.statusCode, found.body).toBe(201);
    expect(found.json()).toEqual({ id: f.id, name: 'রিনা' });
    expect((await admin(f, '/lookup', { identifier: f.email.toUpperCase() })).statusCode).toBe(201);
    expect((await admin(finance, '/lookup', { identifier: f.phone })).statusCode).toBe(403);
    await database.pool.query('update users set email_verified_at=null where id=$1', [f.id]);
    expect((await admin(f, '/lookup', { identifier: f.email })).statusCode).toBe(403);
    await database.pool.query(
      "insert into staff_identity_contacts(id,staff_user_id,kind,value) values(gen_random_uuid(),$1,'phone',$2)",
      [f.staffId, f.phone],
    );
    expect((await admin(f, '/lookup', { identifier: f.phone })).statusCode).toBe(403);
  });
  it('allows sign-in on the new verified phone and fresh TOTP enrollment', async () => {
    const f = await fixture(),
      newPhone = phone(),
      p = await preview(f, { newPhone });
    const phoneCode = await proof(f, p, 'phone');
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode })).statusCode).toBe(201);
    const post = (url: string, payload: object, cookie?: string) =>
      app.inject({
        method: 'POST',
        url,
        payload,
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          ...(cookie ? { cookie } : {}),
        },
        remoteAddress: f.ip,
      });
    // Advance only this fixture's resend key; delivery/verification still use the real code service.
    await app
      .get(ValkeyClient)
      .connection.del(`auth:resend:${createHash('sha256').update(newPhone).digest('hex')}`);
    expect((await post('/auth/code', { purpose: 'sign_in', phone: newPhone })).statusCode).toBe(
      204,
    );
    const code = delivered
      .filter((message) => message.to === f.email)
      .at(-1)!
      .text.match(/\b\d{6}\b/)![0];
    const login = await post('/auth/code/verify', {
      purpose: 'sign_in',
      phone: newPhone,
      code,
      isRemembered: false,
    });
    expect(login.statusCode, login.body).toBe(204);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    await app
      .get(ValkeyClient)
      .connection.del(`auth:resend:${createHash('sha256').update(newPhone).digest('hex')}`);
    expect((await post('/me/totp/proof', {}, cookie)).statusCode).toBe(204);
    const proofCode = delivered
      .filter((message) => message.to === f.email)
      .at(-1)!
      .text.match(/\b\d{6}\b/)![0];
    const setup = await post('/me/totp/setup', { proofCode }, cookie);
    expect(setup.statusCode, setup.body).toBe(200);
    const secret = new URL(setup.json().uri).searchParams.get('secret')!;
    const totp = new TOTP({ secret: Secret.fromBase32(secret) }).generate();
    const confirmed = await post(
      '/me/totp/confirm',
      { setupId: setup.json().setupId, code: totp },
      cookie,
    );
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(confirmed.json().backupCodes).toHaveLength(10);
    expect((await state(f.id)).totp_enabled_at).not.toBeNull();
  });
  it('rolls back the entire action on notification intent failure or a taken replacement contact', async () => {
    const f = await fixture(),
      other = await fixture();
    const before = await state(f.id);
    const p = await preview(f, { newPhone: other.phone });
    const phoneCode = await proof(f, p, 'phone');
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode })).statusCode).toBe(409);
    expect(await state(f.id)).toEqual(before);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
    const next = await preview(f);
    const spy = vi
      .spyOn(app.get(SecurityNoticesService), 'enqueue')
      .mockRejectedValueOnce(new Error('Fixture intent failure'));
    expect(
      (await admin(f, '', { ...next, confirmed: true, phoneCode: await proof(f, next, 'phone') }))
        .statusCode,
    ).toBe(500);
    spy.mockRestore();
    expect(await state(f.id)).toEqual(before);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
  });
  it('rejects changed effects, missing confirmation and a different operator session', async () => {
    const f = await fixture(),
      other = await fixture(),
      p = await preview(f);
    expect(
      (await admin(f, '', { ...p, effect: { ...p.effect, removeTotp: false }, confirmed: true }))
        .statusCode,
    ).toBe(400);
    expect((await admin(f, '', { ...p, confirmed: false })).statusCode).toBe(400);
    expect((await admin(other, '', { ...p, confirmed: true })).statusCode).toBe(409);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
    await database.pool.query('update users set is_disabled=true where id=$1', [f.id]);
    const missing = await admin(other, '/lookup', { identifier: phone() }),
      disabled = await admin(other, '/lookup', { identifier: f.phone });
    expect(disabled.statusCode).toBe(403);
    expect(disabled.json()).toEqual(missing.json());
  });
  it('commits audit first, revokes every old session on account and store routes, and records staff history', async () => {
    const f = await fixture();
    for (const cookie of f.cookies)
      for (const path of ['/me', '/account-recovery-history'])
        expect((await shop(cookie, path)).statusCode).toBe(200);
    const p = await preview(f);
    const users = app.get(UsersService),
      original = users.recover.bind(users);
    const spy = vi.spyOn(users, 'recover').mockImplementationOnce(async (id, changes, now) => {
      const rows = await app
        .get(AccountDatabase)
        .inTransaction(id, (tx) =>
          tx.execute(sql`select id from staff_audit_log where id=${p.effect.id}::uuid`),
        );
      expect(rows.rows).toHaveLength(1);
      return original(id, changes, now);
    });
    const response = await admin(f, '', {
      ...p,
      confirmed: true,
      phoneCode: await proof(f, p, 'phone'),
    });
    spy.mockRestore();
    expect(response.statusCode, response.body).toBe(201);
    expect(await state(f.id)).toMatchObject({ totp_enabled_at: null, backup_code_hashes: null });
    expect(await recoveryRows(f.id)).toEqual({ audits: 1, events: 2, notices: 2, history: 1 });
    for (const cookie of f.cookies)
      for (const path of ['/me', '/account-recovery-history'])
        expect((await shop(cookie, path)).statusCode).toBe(401);
    const fresh = await session(f.id, f.storeId);
    expect((await shop(fresh, '/me/security-history')).json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'recovery.completed',
          actorType: 'staff',
          reasonType: 'lost_authenticator',
        }),
      ]),
    );
    expect((await shop(fresh, '/account-recovery-history')).json().items).toHaveLength(1);
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(409);
  });
  it('leaves credentials, sessions, history and notices untouched if the staff audit fails', async () => {
    const f = await fixture(),
      p = await preview(f),
      before = await state(f.id);
    const audit = app.get(StaffAuditRepository);
    const spy = vi.spyOn(audit, 'recordForAccount').mockImplementationOnce((id) =>
      app.get(AccountDatabase).inTransaction(id, async (tx) => {
        await tx.execute(
          sql`insert into staff_audit_log(action,reason,target_id,staff_user_id) values('account.recovered','too short',${id}::uuid,${f.staffId}::uuid)`,
        );
        return '';
      }),
    );
    expect(
      (await admin(f, '', { ...p, confirmed: true, phoneCode: await proof(f, p, 'phone') }))
        .statusCode,
    ).toBe(500);
    spy.mockRestore();
    expect(await state(f.id)).toEqual(before);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
    expect((await shop(f.cookies[0]!, '/me')).statusCode).toBe(200);
  });
  it('binds new-contact codes to the exact recovery and notifies old/new contacts and every Owner channel', async () => {
    const f = await fixture();
    const owner = await user(true);
    const second = await store(owner.id, f.id);
    const newPhone = phone(),
      newEmail = `new-${randomUUID()}@example.test`;
    const p = await preview(f, { newPhone, newEmail });
    const phoneCode = await proof(f, p, 'phone'),
      emailCode = await proof(f, p, 'email');
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode, emailCode })).statusCode).toBe(
      201,
    );
    expect(await state(f.id)).toMatchObject({ phone: newPhone, email: newEmail });
    await app.get(SecurityNoticesService).dispatch(f.id);
    const notices = delivered.filter((message) =>
      message.text.startsWith('Recovered by Dakly support'),
    );
    for (const target of [f.phone, f.email, newPhone, newEmail, owner.phone, owner.email])
      expect(
        notices.some(
          (message) =>
            message.to === target &&
            message.text.includes('phone replaced') &&
            message.text.includes('email replaced'),
        ),
      ).toBe(true);
    expect(await recoveryRows(f.id)).toMatchObject({ history: 2, notices: 6 });
    const rows = await app.get(StaffRecoveryRepository).history(second);
    expect(rows).toHaveLength(1);
  });
  it('rejects missing or cross-action contact proof and stale state without any mutation', async () => {
    const f = await fixture(),
      p = await preview(f, { newPhone: phone() });
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(400);
    const code = await proof(f, p, 'phone'),
      other = await preview(f, { newPhone: p.effect.newPhone });
    expect((await admin(f, '', { ...other, confirmed: true, phoneCode: code })).statusCode).toBe(
      400,
    );
    await database.pool.query('update users set security_version=security_version+1 where id=$1', [
      f.id,
    ]);
    // A stale recovery is refused before the code is consumed, so a retry is still stale.
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode: code })).statusCode).toBe(409);
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode: code })).statusCode).toBe(409);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
  });
  it('denies a previously linked staff identity after its verified shop contacts change', async () => {
    const f = await fixture();
    await database.pool.query(
      "insert into staff_identity_contacts(id,staff_user_id,kind,value) values(gen_random_uuid(),$1,'phone',$2)",
      [f.staffId, f.phone],
    );
    await database.pool.query('update users set phone=$2,email=$3 where id=$1', [
      f.id,
      phone(),
      `changed-${randomUUID()}@example.test`,
    ]);
    expect((await admin(f, '/preview', input(f))).statusCode).toBe(403);
  });
  it('denies another staff account, staff-owned replacement contacts and work-store conflicts', async () => {
    const f = await fixture(),
      other = await fixture();
    await database.pool.query(
      "insert into staff_identity_contacts(id,staff_user_id,kind,value) values(gen_random_uuid(),$1,'email',$2)",
      [other.staffId, other.email],
    );
    expect((await admin(f, '/preview', { ...input(f), targetId: other.id })).statusCode).toBe(403);
    expect((await admin(f, '/preview', { ...input(f), newEmail: other.email })).statusCode).toBe(
      403,
    );
    await database.pool.query(
      "insert into staff_identity_contacts(id,staff_user_id,kind,value) values(gen_random_uuid(),$1,'phone',$2)",
      [f.staffId, other.phone],
    );
    await database.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'admin','active')",
      [f.storeId, other.id],
    );
    expect((await admin(f, '/preview', input(f))).statusCode).toBe(403);
  });
  it('does not associate unverified emails and permits Super admin recovery of a store-less account', async () => {
    const f = await fixture('super_admin', false);
    await database.pool.query('update users set email_verified_at=null where id=$1', [f.id]);
    await database.pool.query(
      "insert into staff_identity_contacts(id,staff_user_id,kind,value) values(gen_random_uuid(),$1,'email',$2)",
      [f.staffId, f.email],
    );
    const p = await preview(f, {
      checks: {
        nidLastFourMatched: true,
        storeDetailsMatched: false,
        oldNumberCallbackAttempted: true,
      },
      removeTotp: false,
    });
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(201);
    expect(await recoveryRows(f.id)).toMatchObject({ audits: 1, history: 0, notices: 1 });
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(409);
  });
  it('rechecks role, parent session and expiry after preview', async () => {
    const f = await fixture(),
      p = await preview(f);
    await database.pool.query("update staff_users set role='finance' where id=$1", [f.staffId]);
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(403);
    await database.pool.query("update staff_users set role='support' where id=$1", [f.staffId]);
    const now = Date.now();
    const clock = vi.spyOn(Clock.prototype, 'now').mockReturnValue(new Date(now + 300001));
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(409);
    clock.mockRestore();
    await database.pool.query('update staff_sessions set revoked_at=now() where staff_user_id=$1', [
      f.staffId,
    ]);
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(401);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
  });
  it('rejects more than 100 shops without changes or partial notification intent', async () => {
    const f = await fixture('support', false);
    const p = await preview(f);
    const rows = await database.pool.query(
      "insert into stores(id,name) select gen_random_uuid(),'Bounded recovery fixture' from generate_series(1,101) returning id",
    );
    const ids = rows.rows.map((row: { id: string }) => row.id);
    storeIds.push(...ids);
    await database.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) select gen_random_uuid(),s,$2,'owner','active' from unnest($1::uuid[]) s",
      [ids, f.id],
    );
    expect((await admin(f, '/preview', input(f))).statusCode).toBe(409);
    expect((await admin(f, '', { ...p, confirmed: true })).statusCode).toBe(409);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
  });
  it('keeps recovery history isolated from unrelated shops and later memberships', async () => {
    const f = await fixture(),
      other = await fixture();
    const p = await preview(f);
    const phoneCode = await proof(f, p, 'phone');
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode })).statusCode).toBe(201);
    expect((await shop(other.cookies[0]!, '/account-recovery-history')).json().items).toHaveLength(
      0,
    );
    await database.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'admin','active')",
      [other.storeId, f.id],
    );
    expect(await app.get(StaffRecoveryRepository).history(other.storeId!)).toHaveLength(0);
    const rows = await app
      .get(TenantDatabase)
      .forStore(other.storeId!, (tx) =>
        tx.execute(
          sql`select audit_id from staff_recovery_history where audit_id in (select id from staff_audit_log where target_id=${f.id}::uuid)`,
        ),
      );
    expect(rows.rows).toHaveLength(0);
    const member = await session(f.id, other.storeId);
    expect((await shop(member, '/account-recovery-history')).statusCode).toBe(403);
    await database.pool.query(
      "update memberships set built_in_role='admin' where store_id=$1 and user_id=$2",
      [f.storeId, f.id],
    );
    await database.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'owner','active')",
      [f.storeId, other.id],
    );
    const successor = await session(other.id, f.storeId);
    expect((await shop(successor, '/account-recovery-history')).json().items[0].id).toBe(
      p.effect.id,
    );
  });
  it('cannot restore future access when an old session lookup was already pending', async () => {
    const f = await fixture(),
      p = await preview(f),
      phoneCode = await proof(f, p, 'phone'),
      repository = app.get(SessionsService);
    const original = repository.resolve.bind(repository);
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const spy = vi.spyOn(repository, 'resolve').mockImplementationOnce(async (...args) => {
      const row = await original(...args);
      started();
      await waiting;
      return row;
    });
    const pending = shop(f.cookies[0]!, '/me');
    await began;
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode })).statusCode).toBe(201);
    release();
    await pending;
    spy.mockRestore();
    for (const path of ['/me', '/account-recovery-history'])
      expect((await shop(f.cookies[0]!, path)).statusCode).toBe(401);
  });
  it('rechecks disabled staff after the request guard while waiting to recover', async () => {
    const f = await fixture(),
      p = await preview(f),
      users = app.get(UsersService);
    const original = users.recoveryState.bind(users);
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
      }),
      began = new Promise<void>((resolve) => {
        started = resolve;
      });
    const phoneCode = await proof(f, p, 'phone');
    // The first read is the check before the code is consumed; wait in the recovery transaction.
    const spy = vi
      .spyOn(users, 'recoveryState')
      .mockImplementationOnce(original)
      .mockImplementationOnce(async (id) => {
        started();
        await waiting;
        return original(id);
      });
    const pending = admin(f, '', { ...p, confirmed: true, phoneCode });
    await began;
    await database.pool.query("update staff_users set status='disabled' where id=$1", [f.staffId]);
    release();
    expect((await pending).statusCode).toBe(403);
    spy.mockRestore();
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
  });
  it('excludes a former shop Owner when membership removal commits while recovery waits for its store lock', async () => {
    const f = await fixture();
    const formerOwner = await user();
    const removedStore = await store(formerOwner.id, f.id);
    const p = await preview(f);
    const phoneCode = await proof(f, p, 'phone');
    const removal = await database.pool.connect();
    let pending: ReturnType<typeof admin> | undefined;
    // Lock the store after the code check, so the recovery transaction is the one that waits.
    const paused = pauseAfterProof();
    try {
      pending = admin(f, '', { ...p, confirmed: true, phoneCode });
      await paused.consumed;
      await removal.query('begin');
      const {
        rows: [{ pid }],
      } = await removal.query('select pg_backend_pid() as pid');
      await removal.query('select id from stores where id=$1 for no key update', [removedStore]);
      paused.resume();
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
      await removal.query(
        "update memberships set status='removed',removed_at=now() where store_id=$1 and user_id=$2",
        [removedStore, f.id],
      );
      await removal.query('commit');
      const result = await pending;
      expect(result.statusCode, result.body).toBe(201);
      await app.get(SecurityNoticesService).dispatch(f.id);
      expect(
        delivered.filter((message) => [formerOwner.phone, formerOwner.email].includes(message.to)),
      ).toEqual([]);
      expect(await app.get(StaffRecoveryRepository).history(removedStore)).toEqual([]);
      expect(await recoveryRows(f.id)).toMatchObject({ history: 1, notices: 2 });
    } finally {
      paused.resume();
      paused.restore();
      await removal.query('rollback');
      removal.release();
      await pending;
    }
  });
  it.each(['/lookup', '/preview', ''])(
    'serializes contact provisioning against recovery %s without a user and identity lock deadlock',
    async (path) => {
      const f = await fixture();
      const p = await preview(f);
      let payload: object = input(f);
      if (path === '') payload = { ...p, confirmed: true, phoneCode: await proof(f, p, 'phone') };
      if (path === '/lookup') payload = { identifier: f.phone };
      const newStaffId = randomUUID();
      staffIds.push(newStaffId);
      const users = app.get(UsersService);
      const original = users.recoveryState.bind(users);
      let release!: () => void, started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const began = new Promise<void>((resolve) => {
        started = resolve;
      });
      const spy = vi.spyOn(users, 'recoveryState');
      // Recovery reads the account once before consuming the code; wait in the recovery transaction.
      if (path === '') spy.mockImplementationOnce(original);
      spy.mockImplementationOnce(async (id) => {
        const result = await original(id);
        started();
        await waiting;
        return result;
      });
      const recovery = admin(f, path, payload);
      await began;
      let provisioningPid = 0,
        settled = false;
      const provision = app
        .get(StaffDatabase)
        .forStaff(newStaffId, async (tx) => {
          provisioningPid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`))
            .rows[0]!.pid;
          await app.get(StaffRepository).provision(newStaffId, {
            operatorIdentity: 'recovery-test',
            email: `${newStaffId}@example.test`,
            name: 'Concurrent staff',
            role: 'support',
            accessSubject: newStaffId,
            phone: f.phone,
            personalEmails: [f.email],
            reason: 'Provision trusted support identity',
          });
        })
        .then(
          () => {
            settled = true;
            return { ok: true };
          },
          (error) => {
            settled = true;
            return { ok: false, error };
          },
        );
      try {
        await expect
          .poll(
            async () =>
              settled ||
              (
                await database.pool.query(
                  "select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') as blocked",
                  [provisioningPid],
                )
              ).rows[0].blocked,
          )
          .toBe(true);
        release();
        const [result, provisioned] = await Promise.all([recovery, provision]);
        expect(provisioned).toEqual({ ok: true });
        expect(result.statusCode, result.body).toBe(403);
        expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
        expect(
          (
            await database.pool.query(
              'select user_id from staff_user_links where staff_user_id=$1',
              [newStaffId],
            )
          ).rows,
        ).toEqual([{ user_id: f.id }]);
      } finally {
        release();
        await Promise.allSettled([recovery, provision]);
        spy.mockRestore();
      }
    },
  );
  it.each(['provision-first', 'recovery-first'])(
    'orders shared contact keys without deadlock when %s',
    async (order) => {
      const f = await fixture();
      f.email = `a_b.${f.id}@example.test`;
      await database.pool.query('update users set email=$2 where id=$1', [f.id, f.email]);
      const newPhone = phone(),
        newEmail = `ab-${f.id}@example.test`;
      const p = await preview(f, { newPhone, newEmail });
      const phoneCode = await proof(f, p, 'phone'),
        emailCode = await proof(f, p, 'email');
      const newStaffId = randomUUID();
      staffIds.push(newStaffId);
      const gate = await database.pool.connect();
      let provision: Promise<void> | undefined, recovery: ReturnType<typeof admin> | undefined;
      const startRecovery = () => admin(f, '', { ...p, confirmed: true, phoneCode, emailCode });
      const paused = order === 'recovery-first' ? pauseAfterProof() : undefined;
      try {
        await gate.query('begin');
        const {
          rows: [{ pid }],
        } = await gate.query('select pg_backend_pid() as pid');
        const {
          rows: [{ value: firstEmail }],
        } = await gate.query('select value from unnest($1::text[]) value order by value limit 1', [
          [f.email, newEmail],
        ]);
        // Take the gate after the code check, so the recovery transaction is the one queued.
        if (paused) {
          recovery = startRecovery();
          await paused.consumed;
        }
        await gate.query(
          "select pg_advisory_xact_lock(hashtextextended('staff-identity:email:' || $1,0))",
          [firstEmail],
        );
        paused?.resume();
        const startProvision = () =>
          app.get(StaffDatabase).forStaff(newStaffId, () =>
            app.get(StaffRepository).provision(newStaffId, {
              operatorIdentity: 'recovery-test',
              email: `zz-${newStaffId}@example.test`,
              name: 'Concurrent staff',
              role: 'support',
              accessSubject: newStaffId,
              phone: f.phone,
              personalEmails: [f.email, newEmail],
              reason: 'Provision trusted support identity',
            }),
          );
        const waitForQueued = async (total: number) =>
          expect
            .poll(async () =>
              Number(
                (
                  await database.pool.query(
                    'with recursive blocked(pid) as (select $1::int union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(*)-1 as total from blocked',
                    [pid],
                  )
                ).rows[0].total,
              ),
            )
            .toBe(total);
        if (order === 'provision-first') provision = startProvision();
        await waitForQueued(1);
        if (order === 'provision-first') recovery = startRecovery();
        else provision = startProvision();
        await waitForQueued(2);
        await gate.query('commit');
        const [result] = await Promise.all([recovery!, provision!]);
        expect(result.statusCode, result.body).toBe(order === 'provision-first' ? 403 : 201);
        expect(
          (
            await database.pool.query(
              'select user_id from staff_user_links where staff_user_id=$1',
              [newStaffId],
            )
          ).rows,
        ).toEqual([{ user_id: f.id }]);
        expect((await state(f.id)).phone).toBe(order === 'provision-first' ? f.phone : newPhone);
      } finally {
        paused?.resume();
        paused?.restore();
        await gate.query('rollback');
        gate.release();
        await Promise.allSettled([provision, recovery]);
      }
    },
  );
  it('rejects an already authorized second-factor sign-in queued behind session revocation', async () => {
    const f = await fixture();
    const backupCode = randomBytes(10).toString('hex');
    const secret = app
      .get(EnvelopeEncryption)
      .encrypt(
        { owner: 'user', userId: f.id, purpose: 'totp' },
        Buffer.from('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),
      );
    await database.pool.query(
      'update users set totp_secret_ciphertext=$2,totp_key_version=$3,backup_code_hashes=$4 where id=$1',
      [
        f.id,
        secret.ciphertext,
        secret.keyVersion,
        [app.get(TotpCredentials).hashBackup(f.id, backupCode)],
      ],
    );
    const p = await preview(f, { removeTotp: false });
    const post = (url: string, payload: object) =>
      app.inject({
        method: 'POST',
        url,
        payload,
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
        remoteAddress: f.ip,
      });
    expect((await post('/auth/code', { purpose: 'sign_in', phone: f.phone })).statusCode).toBe(204);
    const code = delivered
      .filter((message) => message.to === f.email)
      .at(-1)!
      .text.match(/\b\d{6}\b/)![0];
    const challenge = await post('/auth/code/verify', { purpose: 'sign_in', phone: f.phone, code });
    expect(challenge.statusCode, challenge.body).toBe(202);
    const holder = await database.pool.connect();
    let recovery: ReturnType<typeof admin> | undefined, signIn: ReturnType<typeof post> | undefined;
    try {
      await holder.query('begin');
      const {
        rows: [{ pid }],
      } = await holder.query('select pg_backend_pid() as pid');
      await holder.query('select id from users where id=$1 for no key update', [f.id]);
      const waitForQueued = async (total: number) =>
        expect
          .poll(async () =>
            Number(
              (
                await database.pool.query(
                  'with recursive blocked(pid) as (select $1::int union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(*)-1 as total from blocked',
                  [pid],
                )
              ).rows[0].total,
            ),
          )
          .toBe(total);
      recovery = admin(f, '', { ...p, confirmed: true });
      await waitForQueued(1);
      signIn = post('/auth/totp', { challengeId: challenge.json().challengeId, code: backupCode });
      await waitForQueued(2);
      await holder.query('commit');
      const [recovered, attempt] = await Promise.all([recovery, signIn]);
      expect(recovered.statusCode, recovered.body).toBe(201);
      expect(attempt.statusCode, attempt.body).toBe(400);
      expect(attempt.json().error.code).toBe('AUTH_TOTP_INVALID');
      const sessions = await database.pool.query(
        'select revoked_at from sessions where user_id=$1',
        [f.id],
      );
      expect(sessions.rows).toHaveLength(2);
      expect(sessions.rows.every((row) => row.revoked_at)).toBe(true);
      expect((await state(f.id)).backup_code_hashes).toEqual([
        app.get(TotpCredentials).hashBackup(f.id, backupCode),
      ]);
    } finally {
      await holder.query('rollback');
      holder.release();
      await Promise.allSettled([recovery, signIn]);
    }
  });
  it('queues new-store creation behind recovery and does not attach the earlier event to the later store', async () => {
    const f = await fixture('support', false);
    const p = await preview(f);
    const phoneCode = await proof(f, p, 'phone');
    const users = app.get(UsersService);
    const original = users.recoveryState.bind(users);
    let release!: () => void,
      started!: () => void,
      recoveryPid = 0;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    // The first read is the check before the code is consumed; wait in the recovery transaction.
    const spy = vi
      .spyOn(users, 'recoveryState')
      .mockImplementationOnce(original)
      .mockImplementationOnce(async (id) => {
        const result = await original(id);
        recoveryPid = await app
          .get(AccountDatabase)
          .inTransaction(
            id,
            async (tx) =>
              (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]!.pid,
          );
        started();
        await waiting;
        return result;
      });
    const recovery = admin(f, '', { ...p, confirmed: true, phoneCode });
    await began;
    let completed = false;
    const creating = app
      .inject({
        method: 'POST',
        url: '/stores',
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie: f.cookies[0] },
        payload: {
          name: 'Concurrent recovery shop',
          businessType: 'Clothing',
          district: 'Dhaka',
          howYouSell: ['social_media'],
          customerListSize: '2000_to_10000',
          planCode: 'growth',
          billingCycle: 'yearly',
        },
      })
      .then((result) => {
        completed = true;
        return result;
      });
    try {
      await expect
        .poll(
          async () =>
            completed ||
            (
              await database.pool.query(
                'select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) as blocked',
                [recoveryPid],
              )
            ).rows[0].blocked,
        )
        .toBe(true);
      expect(completed).toBe(false);
      expect(
        (await database.pool.query('select store_id from memberships where user_id=$1', [f.id]))
          .rows,
      ).toEqual([]);
      release();
      expect((await recovery).statusCode).toBe(201);
      await creating;
      expect(await recoveryRows(f.id)).toMatchObject({ history: 0 });
      expect((await shop(f.cookies[0]!, '/me')).statusCode).toBe(401);
    } finally {
      release();
      await Promise.allSettled([recovery, creating]);
      spy.mockRestore();
      const created = await database.pool.query(
        'select store_id from memberships where user_id=$1',
        [f.id],
      );
      storeIds.push(...created.rows.map((row) => row.store_id));
    }
  });
  it('persists every recipient beyond one delivery batch and keeps canonical shop history', async () => {
    const f = await fixture();
    const owners = await Promise.all(Array.from({ length: 25 }, () => user()));
    await Promise.all(owners.map((owner) => store(owner.id, f.id)));
    const p = await preview(f);
    const phoneCode = await proof(f, p, 'phone');
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode })).statusCode).toBe(201);
    expect(await recoveryRows(f.id)).toMatchObject({ history: 26, notices: 52 });
    const notices = app.get(SecurityNoticesService);
    await notices.dispatch(f.id);
    expect(
      (
        await database.pool.query(
          'select count(*)::int n from account_security_notices where user_id=$1 and delivered_at is null',
          [f.id],
        )
      ).rows[0].n,
    ).toBe(32);
    await notices.dispatch(f.id);
    await notices.dispatch(f.id);
    expect(
      (
        await database.pool.query(
          'select count(*)::int n from account_security_notices where user_id=$1 and delivered_at is null',
          [f.id],
        )
      ).rows[0].n,
    ).toBe(0);
    const [history] = await app.get(StaffRecoveryRepository).history(f.storeId!);
    const audit = (
      await database.pool.query('select created_at from staff_audit_log where id=$1', [p.effect.id])
    ).rows[0];
    expect(history).toEqual({
      id: p.effect.id,
      userId: f.id,
      reasonType: 'lost_authenticator',
      createdAt: audit.created_at,
    });
  });
  it('paginates canonical Owner events without exposing staff reason or check details', async () => {
    const f = await fixture(),
      ids = Array.from({ length: 51 }, () => newId());
    await database.pool.query(
      "insert into staff_audit_log(id,staff_user_id,action,target_type,target_id,reason,action_details) select a,$2,'account.recovered','user',$3,'Synthetic history fixture',jsonb_build_object('reasonType','lost_phone','checks',jsonb_build_object('nidLastFourMatched',true)) from unnest($1::uuid[]) a",
      [ids, f.staffId, f.id],
    );
    await database.pool.query(
      'insert into staff_recovery_history(store_id,audit_id) select $1,a from unnest($2::uuid[]) a',
      [f.storeId, ids],
    );
    const first = await shop(f.cookies[0]!, '/account-recovery-history');
    expect(first.statusCode).toBe(200);
    expect(first.json().items).toHaveLength(50);
    const firstItems = first.json().items;
    expect(Object.keys(firstItems[0]).sort()).toEqual(['createdAt', 'id', 'reasonType', 'userId']);
    const second = await shop(
      f.cookies[0]!,
      `/account-recovery-history?before=${first.json().nextCursor}`,
    );
    expect(second.json().items).toHaveLength(1);
    expect(second.json().nextCursor).toBeNull();
    expect(new Set([...firstItems, ...second.json().items].map((item) => item.id)).size).toBe(51);
  });
  it('retains failed notice intents and retries without repeating recovery', async () => {
    const f = await fixture(),
      p = await preview(f);
    const phoneCode = await proof(f, p, 'phone');
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode })).statusCode).toBe(201);
    vi.mocked(EmailService.prototype.send).mockRejectedValueOnce(new Error('Local email failure'));
    await app.get(SecurityNoticesService).dispatch(f.id);
    const pending = await database.pool.query(
      'select id from account_security_notices where user_id=$1 and delivered_at is null',
      [f.id],
    );
    expect(pending.rows).toHaveLength(1);
    await database.pool.query(
      'update account_security_notices set retry_at=now() where user_id=$1',
      [f.id],
    );
    await app.get(SecurityNoticesService).dispatch(f.id);
    expect(
      (
        await database.pool.query(
          'select id from account_security_notices where user_id=$1 and delivered_at is null',
          [f.id],
        )
      ).rows,
    ).toHaveLength(0);
    expect(await recoveryRows(f.id)).toMatchObject({ audits: 1, events: 2, notices: 2 });
  });
  it('runs the recovery checks before consuming the codes, so a refusal keeps them usable', async () => {
    const f = await fixture(),
      p = await preview(f, { newPhone: phone() });
    const phoneCode = await proof(f, p, 'phone');
    const owner = await user();
    await database.pool.query(
      'update users set phone_verified_at=null,email_verified_at=null where id=$1',
      [owner.id],
    );
    await store(owner.id, f.id);
    const refused = await admin(f, '', { ...p, confirmed: true, phoneCode });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('RECOVERY_CONTACT');
    await database.pool.query('update users set email_verified_at=now() where id=$1', [owner.id]);
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode })).statusCode).toBe(201);
    expect((await state(f.id)).phone).toBe(p.effect.newPhone);
  });
  it('requires a current verified contact code to remove 2-step without a replacement contact', async () => {
    const f = await fixture(),
      p = await preview(f),
      before = await state(f.id);
    const missing = await admin(f, '', { ...p, confirmed: true });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('RECOVERY_PROOF');
    const emailCode = await proof(f, p, 'email');
    expect((await admin(f, '', { ...p, confirmed: true, phoneCode: emailCode })).statusCode).toBe(
      400,
    );
    expect(await state(f.id)).toEqual(before);
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
    expect((await admin(f, '', { ...p, confirmed: true, emailCode })).statusCode).toBe(201);
    expect(await state(f.id)).toMatchObject({ totp_enabled_at: null, backup_code_hashes: null });
  });
  it('refuses 2-step removal without a replacement contact when no current contact is verified', async () => {
    const f = await fixture('support', false);
    await database.pool.query('update users set phone_verified_at=null where id=$1', [f.id]);
    const p = await preview(f);
    const unverified = await admin(f, '/code', { ...p, channel: 'phone' });
    expect(unverified.statusCode).toBe(400);
    expect(unverified.json().error.code).toBe('RECOVERY_PROOF');
    const emailCode = await proof(f, p, 'email');
    await database.pool.query('update users set email_verified_at=null where id=$1', [f.id]);
    const previewed = await admin(f, '/preview', input(f));
    expect(previewed.statusCode).toBe(409);
    expect(previewed.json().error.code).toBe('RECOVERY_CONTACT');
    const recovered = await admin(f, '', { ...p, confirmed: true, emailCode });
    expect(recovered.statusCode).toBe(409);
    expect(recovered.json().error.code).toBe('RECOVERY_CONTACT');
    expect(await recoveryRows(f.id)).toEqual({ audits: 0, events: 0, notices: 0, history: 0 });
    expect((await state(f.id)).totp_enabled_at).not.toBeNull();
    expect((await admin(f, '/preview', { ...input(f), removeTotp: false })).statusCode).toBe(201);
  });
});
