import 'reflect-metadata';
import { passkeyFixture } from '../../test/staff-passkey-fixture';
import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { TOTP, Secret } from 'otpauth';
import { createDatabase } from '@dakly/db/client';
import { StaffProvisionModule } from './staff-provision.module';
import { SessionsService } from '../sessions/sessions.service';
import { StaffSessionsService } from './staff-sessions.service';
import { StaffAccessService } from './staff-access.service';
import { StaffProvisionService } from './staff-provision.service';
import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { Clock } from '../platform/clock';
import { hashPassword } from '../platform/crypto/password';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { staffTokenHash } from './staff-tokens';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { AccountTransaction } from '../platform/database/account-transaction';
import { StoreTransaction } from '../platform/database/store-transaction';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule, AdminModule, StaffProvisionModule] })(TestModule);
const origin = 'http://localhost:3010';
const password = 'correct-password123';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
describe('Staff authentication over Fastify and PostgreSQL', () => {
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ids: string[] = [];
  let app: NestFastifyApplication;
  let key: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let now = new Date('2026-11-14T12:00:00Z');
  const code = () =>
    new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: now.getTime() });
  const access = (id: string, email: string) =>
    new SignJWT({ email, type: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
      .setIssuer('https://dakly-test.cloudflareaccess.com')
      .setAudience('staff-app')
      .setSubject(id)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
  async function seed(enrolled = true) {
    const id = randomUUID();
    ids.push(id);
    const email = `${id}@example.test`;
    const envelope = app
      .get(EnvelopeEncryption)
      .encrypt({ owner: 'staff', staffUserId: id, purpose: 'totp' }, Buffer.from(secret));
    await database.pool.query(
      'insert into staff_users(id,email,name,role,access_subject,password_hash,enrolled_at,totp_secret_ciphertext,totp_key_version) values($1::uuid,$2,$3,$4,$1::text,$5,$6,$7,$8)',
      [
        id,
        email,
        'Rina',
        'support',
        enrolled ? await hashPassword(password) : null,
        enrolled ? now : null,
        enrolled ? envelope.ciphertext : null,
        enrolled ? envelope.keyVersion : null,
      ],
    );
    const assertion = await access(id, email);
    return { id, email, assertion };
  }
  const request = (
    assertion: string,
    url: string,
    payload?: object,
    cookie?: string,
    headers?: Record<string, string>,
  ) =>
    app.inject({
      method: payload ? 'POST' : 'GET',
      url,
      payload,
      headers: {
        host: 'localhost:3010',
        origin,
        'cf-access-jwt-assertion': assertion,
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      remoteAddress: `2001:db8::${randomInt(1, 65535).toString(16)}`,
    });
  async function signIn(staff: Awaited<ReturnType<typeof seed>>) {
    const start = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    expect(start.statusCode).toBe(200);
    expect(start.headers['set-cookie']).toBeUndefined();
    const finish = await request(staff.assertion, '/admin/auth/totp', {
      challenge: start.json().challenge,
      code: code(),
    });
    expect(finish.statusCode, finish.body).toBe(204);
    return String(finish.headers['set-cookie']).split(';')[0]!;
  }
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    key = pair.privateKey;
    vi.stubEnv('ADMIN_ORIGIN', origin);
    vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly-test.cloudflareaccess.com');
    vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
    vi.stubEnv(
      'CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS',
      JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'fixture' }] }),
    );
    vi.stubEnv('STAFF_SESSION_SIGNING_KEY', randomBytes(32).toString('base64'));
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
      abortOnError: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    vi.spyOn(Clock.prototype, 'now').mockImplementation(() => now);
  });
  afterAll(async () => {
    await database.pool.query('delete from staff_audit_log where target_id=any($1::uuid[])', [ids]);
    for (const table of [
      'staff_audit_log',
      'staff_identity_contacts',
      'staff_challenges',
      'staff_passkeys',
      'staff_sessions',
    ])
      await database.pool.query(`delete from ${table} where staff_user_id=any($1::uuid[])`, [ids]);
    await database.pool.query('delete from staff_users where id=any($1::uuid[])', [ids]);
    await database.pool.end();
    await app?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it('requires Access and the admin host/origin before sign-in', async () => {
    const staff = await seed();
    for (const [assertion, headers] of [
      ['', {}],
      [staff.assertion, { host: 'shop.example.test' }],
      [staff.assertion, { origin: 'http://localhost:3000' }],
    ] as const) {
      const result = await request(
        assertion,
        '/admin/auth/sign-in',
        { email: staff.email, password },
        undefined,
        headers,
      );
      expect(result.statusCode).toBe(403);
    }
  });
  it('requires password and TOTP, rejects replay, and keeps staff cookies off shop routes', async () => {
    const staff = await seed();
    const cookie = await signIn(staff);
    expect(
      (await request(staff.assertion, '/admin/auth/session', undefined, cookie)).json(),
    ).toMatchObject({ id: staff.id, role: 'support' });
    const again = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: again.json().challenge,
          code: code(),
        })
      ).statusCode,
    ).toBe(401);
    expect((await request(staff.assertion, '/me/sessions', undefined, cookie)).statusCode).toBe(
      401,
    );
    await database.pool.query('insert into users(id,name,email) values($1,$2,$3)', [
      staff.id,
      'Shop account fixture',
      staff.email,
    ]);
    try {
      const shop = await app
        .get(SessionsService)
        .create(staff.id, { isRemembered: false, ip: '127.0.0.1' });
      const shopCookie = `dakly_session=${shop.token}`;
      expect(
        (await request(staff.assertion, '/me/sessions', undefined, shopCookie)).statusCode,
      ).toBe(200);
      expect(
        (await request(staff.assertion, '/admin/auth/session', undefined, shopCookie)).statusCode,
      ).toBe(401);
    } finally {
      await database.pool.query('delete from users where id=$1', [staff.id]);
    }
  });
  it('enrolls only with a one-use provisioned proof and stores encrypted TOTP', async () => {
    const staff = await seed(false);
    const proof = randomBytes(32).toString('base64url');
    await database.pool.query(
      "insert into staff_challenges(token_hash,staff_user_id,purpose,expires_at) values($1,$2,'enroll',$3)",
      [staffTokenHash(proof), staff.id, new Date(now.getTime() + 86400000)],
    );
    expect(
      (await request(staff.assertion, '/admin/auth/sign-in', { email: staff.email, password }))
        .statusCode,
    ).toBe(401);
    const start = await request(staff.assertion, '/admin/auth/enroll', {
      proof,
      password,
      factor: 'totp',
    });
    expect(start.statusCode, start.body).toBe(200);
    expect(start.headers['set-cookie']).toBeUndefined();
    expect(
      (await request(staff.assertion, '/admin/auth/enroll', { proof, password, factor: 'totp' }))
        .statusCode,
    ).toBe(401);
    const setupCode = new TOTP({ secret: Secret.fromBase32(start.json().totp.secret) }).generate({
      timestamp: now.getTime(),
    });
    const finish = await request(staff.assertion, '/admin/auth/totp', {
      challenge: start.json().challenge,
      code: setupCode,
    });
    expect(finish.statusCode, finish.body).toBe(204);
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: start.json().challenge,
          code: setupCode,
        })
      ).statusCode,
    ).toBe(401);
    const audit = await database.pool.query(
      'select action from staff_audit_log where staff_user_id=$1',
      [staff.id],
    );
    expect(audit.rows.map((row) => row.action)).toContain('staff.enrolled_totp');
  });
  it('expires at the exact idle and absolute boundaries and reads current status', async () => {
    const staff = await seed();
    let cookie = await signIn(staff);
    now = new Date(now.getTime() + 1800000);
    expect(
      (await request(staff.assertion, '/admin/auth/session', undefined, cookie)).statusCode,
    ).toBe(401);
    cookie = await signIn(staff);
    await database.pool.query('update staff_sessions set last_seen_at=$2 where staff_user_id=$1', [
      staff.id,
      new Date(now.getTime() + 28799999),
    ]);
    now = new Date(now.getTime() + 28800000);
    expect(
      (await request(staff.assertion, '/admin/auth/session', undefined, cookie)).statusCode,
    ).toBe(401);
    cookie = await signIn(staff);
    await database.pool.query("update staff_users set status='disabled' where id=$1", [staff.id]);
    expect(
      (await request(staff.assertion, '/admin/auth/session', undefined, cookie)).statusCode,
    ).toBe(401);
  });
  it('commits shared factor failures and blocks the fifth wrong attempt', async () => {
    const staff = await seed();
    for (let attempt = 0; attempt < 5; attempt++)
      expect(
        (
          await request(staff.assertion, '/admin/auth/sign-in', {
            email: staff.email,
            password: 'wrong-password',
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (await request(staff.assertion, '/admin/auth/sign-in', { email: staff.email, password }))
        .statusCode,
    ).toBe(429);
  });
  it('serializes simultaneous challenge completion into one active session', async () => {
    const staff = await seed();
    const start = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(staff.assertion, '/admin/auth/totp', {
          challenge: start.json().challenge,
          code: code(),
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([204, 401]);
    const rows = await database.pool.query(
      'select id from staff_sessions where staff_user_id=$1 and revoked_at is null',
      [staff.id],
    );
    expect(rows.rowCount).toBe(1);
  });
  it('rolls back session and credential changes when mandatory audit fails', async () => {
    const staff = await seed();
    const start = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    const failure = vi
      .spyOn(StaffAuditRepository.prototype, 'record')
      .mockRejectedValueOnce(new Error('audit unavailable'));
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: start.json().challenge,
          code: code(),
        })
      ).statusCode,
    ).toBe(500);
    failure.mockRestore();
    expect(
      (
        await database.pool.query('select id from staff_sessions where staff_user_id=$1', [
          staff.id,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: start.json().challenge,
          code: code(),
        })
      ).statusCode,
    ).toBe(204);
  });
  it('enrolls and authenticates a real UV passkey, checking origin, UV and one-use challenges', async () => {
    const staff = await seed(false);
    const proof = randomBytes(32).toString('base64url');
    const authenticator = passkeyFixture();
    await database.pool.query(
      "insert into staff_challenges(token_hash,staff_user_id,purpose,expires_at) values($1,$2,'enroll',$3)",
      [staffTokenHash(proof), staff.id, new Date(now.getTime() + 86400000)],
    );
    const begin = await request(staff.assertion, '/admin/auth/enroll', {
      proof,
      password,
      factor: 'passkey',
    });
    expect(begin.statusCode, begin.body).toBe(200);
    const credential = authenticator.registration(begin.json().passkey.challenge);
    const registered = await request(staff.assertion, '/admin/auth/passkey/register', {
      challenge: begin.json().challenge,
      credential,
    });
    expect(registered.statusCode, registered.body).toBe(204);
    const start = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    expect(start.statusCode, start.body).toBe(200);
    const challenge = start.json().challenge;
    const browserChallenge = start.json().passkey.challenge;
    for (const invalid of [
      authenticator.authentication(browserChallenge, 1, 'https://attacker.test'),
      authenticator.authentication(browserChallenge, 1, origin, false),
      authenticator.authentication('wrong-challenge'),
    ]) {
      expect(
        (
          await request(staff.assertion, '/admin/auth/passkey/authenticate', {
            challenge,
            credential: invalid,
          })
        ).statusCode,
      ).toBe(401);
    }
    const signed = authenticator.authentication(browserChallenge);
    const completed = await request(staff.assertion, '/admin/auth/passkey/authenticate', {
      challenge,
      credential: signed,
    });
    expect(completed.statusCode, completed.body).toBe(204);
    expect(
      (
        await request(staff.assertion, '/admin/auth/passkey/authenticate', {
          challenge,
          credential: signed,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await request(
          staff.assertion,
          '/admin/auth/session',
          undefined,
          String(registered.headers['set-cookie']).split(';')[0],
        )
      ).statusCode,
    ).toBe(401);
  });
  it('rejects exact challenge expiry, revoked sessions and changed Access identity', async () => {
    const staff = await seed();
    const begin = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    now = new Date(now.getTime() + 300000);
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: begin.json().challenge,
          code: code(),
        })
      ).statusCode,
    ).toBe(401);
    const cookie = await signIn(staff);
    const other = await seed();
    expect(
      (await request(other.assertion, '/admin/auth/session', undefined, cookie)).statusCode,
    ).toBe(401);
    await database.pool.query('update staff_sessions set revoked_at=$2 where staff_user_id=$1', [
      staff.id,
      now,
    ]);
    expect(
      (await request(staff.assertion, '/admin/auth/session', undefined, cookie)).statusCode,
    ).toBe(401);
  });
  it('attributes operator provisioning and renews pending proofs without changing contacts', async () => {
    const operator = app.get(StaffProvisionService);
    const email = `${randomUUID()}@example.test`;
    const input = {
      operatorIdentity: 'fixture-operator',
      email,
      name: 'Rina',
      role: 'support' as const,
      accessSubject: randomUUID(),
      phone: '01712345678',
      personalEmails: ['rina@example.test'],
      reason: 'Verified employee onboarding evidence',
    };
    const first = await operator.provision(input);
    ids.push(first.staffUserId);
    const second = await operator.provision({
      ...input,
      role: 'super_admin',
      personalEmails: ['replacement@example.test'],
    });
    expect(second.staffUserId).toBe(first.staffUserId);
    expect(second.proof).not.toBe(first.proof);
    const record = await database.pool.query('select role from staff_users where id=$1', [
      first.staffUserId,
    ]);
    expect(record.rows[0].role).toBe('support');
    const contacts = await database.pool.query(
      'select value from staff_identity_contacts where staff_user_id=$1',
      [first.staffUserId],
    );
    expect(contacts.rows.map((row) => row.value)).toContain('rina@example.test');
    expect(contacts.rows.map((row) => row.value)).not.toContain('replacement@example.test');
    const audit = await database.pool.query(
      'select staff_user_id,operator_identity from staff_audit_log where target_id=$1',
      [first.staffUserId],
    );
    expect(audit.rows).toEqual([
      { staff_user_id: null, operator_identity: 'fixture-operator' },
      { staff_user_id: null, operator_identity: 'fixture-operator' },
    ]);
    await database.pool.query('update staff_users set enrolled_at=$2 where id=$1', [
      first.staffUserId,
      now,
    ]);
    await expect(operator.provision(input)).rejects.toMatchObject({
      code: 'STAFF_INVALID_CREDENTIALS',
    });
  });
  it('reads changed roles and prevents a disable or revocation from reviving old access', async () => {
    const staff = await seed();
    const cookie = await signIn(staff);
    await database.pool.query("update staff_users set role='finance' where id=$1", [staff.id]);
    const current = await request(staff.assertion, '/admin/auth/session', undefined, cookie);
    expect(current.json().role).toBe('finance');
    expect(() => app.get(StaffAccessService).assertRole(current.json(), ['support'])).toThrow();
    now = new Date(now.getTime() + 30000);
    const pending = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    await database.pool.query("update staff_users set status='disabled' where id=$1", [staff.id]);
    await database.pool.query("update staff_users set status='active' where id=$1", [staff.id]);
    expect(
      (await request(staff.assertion, '/admin/auth/session', undefined, cookie)).statusCode,
    ).toBe(401);
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: pending.json().challenge,
          code: code(),
        })
      ).statusCode,
    ).toBe(401);
    const second = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    await app.get(StaffSessionsService).signOut(staff.id, '127.0.0.1');
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: second.json().challenge,
          code: code(),
        })
      ).statusCode,
    ).toBe(401);
  });
  it('shares failure accounting between passwords and factors and bounds per-IP attempts', async () => {
    const staff = await seed();
    const start = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    const wrong = code() === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (
          await request(staff.assertion, '/admin/auth/totp', {
            challenge: start.json().challenge,
            code: wrong,
          })
        ).statusCode,
      ).toBe(401);
    for (let attempt = 0; attempt < 3; attempt++)
      expect(
        (
          await request(staff.assertion, '/admin/auth/sign-in', {
            email: staff.email,
            password: 'wrong-password',
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (await request(staff.assertion, '/admin/auth/sign-in', { email: staff.email, password }))
        .statusCode,
    ).toBe(429);
    const assertion = await access(randomUUID(), 'unprovisioned@example.test');
    const ip = `2001:db8::${randomInt(1, 65535).toString(16)}`;
    for (let attempt = 0; attempt < 31; attempt++) {
      const result = await app.inject({
        method: 'POST',
        url: '/admin/auth/sign-in',
        payload: { email: 'unprovisioned@example.test', password },
        headers: { host: 'localhost:3010', origin, 'cf-access-jwt-assertion': assertion },
        remoteAddress: ip,
      });
      expect(result.statusCode).toBe(attempt === 30 ? 429 : 401);
    }
  });
  it('does not restore access when factor completion races with staff disable', async () => {
    const staff = await seed();
    const begin = await request(staff.assertion, '/admin/auth/sign-in', {
      email: staff.email,
      password,
    });
    const [completion] = await Promise.all([
      request(staff.assertion, '/admin/auth/totp', {
        challenge: begin.json().challenge,
        code: code(),
      }),
      database.pool.query("update staff_users set status='disabled' where id=$1", [staff.id]),
    ]);
    expect([204, 401]).toContain(completion.statusCode);
    await database.pool.query("update staff_users set status='active' where id=$1", [staff.id]);
    const cookie = String(completion.headers['set-cookie']).split(';')[0];
    expect(
      (await request(staff.assertion, '/admin/auth/session', undefined, cookie)).statusCode,
    ).toBe(401);
    expect(
      (
        await request(staff.assertion, '/admin/auth/totp', {
          challenge: begin.json().challenge,
          code: code(),
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rejects staff, account and store transaction nesting in both directions', async () => {
    const staff = app.get(StaffTransaction);
    const account = app.get(AccountTransaction);
    const store = app.get(StoreTransaction);
    const id = randomUUID();
    await expect(staff.run(id, () => account.run(id, async () => undefined))).rejects.toThrow();
    await expect(account.run(id, () => staff.run(id, async () => undefined))).rejects.toThrow();
    await expect(staff.run(id, () => store.run(id, async () => undefined))).rejects.toThrow();
    await expect(store.run(id, () => staff.run(id, async () => undefined))).rejects.toThrow();
  });
});
