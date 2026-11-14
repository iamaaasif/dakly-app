import { SecurityNoticesRepository } from './security-notices.repository';
import { TeamService } from '../team/team.service';
import 'reflect-metadata';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { TOTP, Secret } from 'otpauth';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { AuthModule } from './auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { loadEnv } from '../platform/config/env';
import { Clock } from '../platform/clock';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { SmtpEmailDriver } from '@dakly/providers/email/smtp/smtp-email-driver';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { SessionsService } from '../sessions/sessions.service';
import { SecurityNoticesService } from './security-notices.service';
import { authKey } from './auth-key';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(TestModule);
const password = 'correct-pass123';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
describe('TOTP account security over Fastify', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ids: string[] = [];
  const messages: Array<{ to: string; text: string }> = [];
  let app: NestFastifyApplication;
  let now = new Date('2026-11-14T12:00:00Z');
  const request = (
    url: string,
    payload?: object,
    cookie?: string,
    method: 'POST' | 'GET' | 'DELETE' = 'POST',
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        origin: 'http://localhost:3000',
        'user-agent': 'Dakly test',
        ...(cookie ? { cookie } : {}),
      },
      remoteAddress: `2001:db8::${randomInt(1, 65535).toString(16)}`,
    });
  const token = () =>
    new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: now.getTime() });
  const seed = async (enabled = true, accountSecret = secret) => {
    const id = randomUUID();
    ids.push(id);
    const phone = `017${randomInt(10000000, 99999999)}`;
    const envelope = new EnvelopeEncryption(loadEnv().encryption).encrypt(
      { owner: 'user', userId: id, purpose: 'totp' },
      Buffer.from(accountSecret),
    );
    await admin.pool.query(
      'insert into users(id,name,phone,phone_verified_at,password_hash,totp_secret_ciphertext,totp_key_version,totp_enabled_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        'রিনা',
        phone,
        now,
        await hash(password),
        envelope.ciphertext,
        envelope.keyVersion,
        enabled ? now : null,
      ],
    );
    return { id, phone };
  };
  beforeAll(async () => {
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation(async (message) => {
      messages.push(message);
      return { providerMessageId: randomUUID() };
    });
    vi.spyOn(SmtpEmailDriver.prototype, 'send').mockImplementation(async (message) => {
      messages.push(message);
    });
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    vi.spyOn(Clock.prototype, 'now').mockImplementation(() => now);
  });
  afterAll(async () => {
    await admin.pool.query('delete from account_security_events where user_id = any($1::uuid[])', [
      ids,
    ]);
    await admin.pool.query('delete from users where id = any($1::uuid[])', [ids]);
    await admin.pool.end();
    await app?.close();
    vi.restoreAllMocks();
  });
  it('keeps password sign-in cookie-free until the second factor and rejects reuse', async () => {
    const user = await seed();
    const first = await request('/auth/password', { identifier: user.phone, password });
    expect(first.statusCode).toBe(202);
    expect(first.headers['set-cookie']).toBeUndefined();
    const second = await request('/auth/totp', {
      challengeId: first.json().challengeId,
      code: token(),
    });
    expect(second.statusCode).toBe(204);
    expect(second.headers['set-cookie']).toBeDefined();
    expect(
      (await request('/auth/totp', { challengeId: first.json().challengeId, code: token() }))
        .statusCode,
    ).toBe(400);
  });
  it('does not revive a challenge after a password change', async () => {
    const user = await seed();
    const first = await request('/auth/password', { identifier: user.phone, password });
    expect(first.statusCode).toBe(202);
    await admin.pool.query('update users set password_hash=$2 where id=$1', [
      user.id,
      await hash('changed-pass123'),
    ]);
    const second = await request('/auth/totp', {
      challengeId: first.json().challengeId,
      code: token(),
    });
    expect(second.statusCode).toBe(400);
    expect(second.headers['set-cookie']).toBeUndefined();
  });
  it('expires a challenge after five minutes', async () => {
    const user = await seed();
    const first = await request('/auth/password', { identifier: user.phone, password });
    expect(first.statusCode).toBe(202);
    const key = authKey('totp-challenge', first.json().challengeId);
    const ttl = await app.get(ValkeyClient).connection.ttl(key);
    expect(ttl).toBeGreaterThan(295);
    expect(ttl).toBeLessThanOrEqual(300);
    const previous = now;
    now = new Date(now.getTime() + 300000);
    try {
      const result = await request('/auth/totp', {
        challengeId: first.json().challengeId,
        code: token(),
      });
      expect(result.statusCode).toBe(400);
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      now = previous;
      await app.get(ValkeyClient).connection.del(key);
    }
  });
  const codeFor = (to: string) =>
    messages
      .findLast((message) => message.to === to && /Your Dakly code/.test(message.text))!
      .text.match(/\b\d{6}\b/)![0];
  const recovery = async (user: { id: string; phone: string }) => {
    expect(
      (await request('/auth/totp/recovery/code', { phone: user.phone, method: 'phone' }))
        .statusCode,
    ).toBe(204);
    const started = await request('/auth/totp/recovery', {
      phone: user.phone,
      phoneCode: codeFor(user.phone),
      password,
    });
    expect(started.statusCode, started.body).toBe(202);
    return started.json() as {
      recoveryId: string;
      completionToken: string;
      eligibleAt: string | null;
    };
  };
  it.each(['phone', 'email', 'google-linked', 'google-link', 'google-mailbox'])(
    'requires TOTP after %s first-factor verification',
    async (method) => {
      const user = await seed();
      const email = `${randomUUID()}@${method === 'google-mailbox' ? 'example.test' : 'gmail.com'}`;
      const subject = randomUUID();
      await admin.pool.query(
        'update users set email=$2,email_verified_at=$3,google_subject=$4 where id=$1',
        [user.id, email, now, method === 'google-linked' ? subject : null],
      );
      let first;
      if (method === 'phone') {
        await request('/auth/code', { purpose: 'sign_in', phone: user.phone });
        first = await request('/auth/code/verify', {
          purpose: 'sign_in',
          phone: user.phone,
          code: codeFor(email),
        });
      } else if (method === 'email') {
        await request('/auth/email/code', { email });
        first = await request('/auth/email/code/verify', { email, code: codeFor(email) });
      } else {
        first = await request('/auth/google', {
          idToken: `fake-google:${JSON.stringify({ sub: subject, email, email_verified: true })}`,
        });
        if (method === 'google-mailbox') {
          expect(first.json().status).toBe('email_verification_required');
          first = await request('/auth/google/email/verify', {
            verificationTicket: first.json().verificationTicket,
            code: codeFor(email),
          });
        }
      }
      expect(first.statusCode, first.body).toBe(202);
      expect(first.headers['set-cookie']).toBeUndefined();
      const second = await request('/auth/totp', {
        challengeId: first.json().challengeId,
        code: token(),
      });
      expect(second.statusCode, second.body).toBe(204);
      expect(second.headers['set-cookie']).toBeDefined();
    },
  );
  it('consumes a backup code once across two concurrent challenges', async () => {
    const user = await seed();
    const backup = randomBytes(10).toString('hex');
    await admin.pool.query('update users set backup_code_hashes=$2 where id=$1', [
      user.id,
      [new TotpCredentials().hashBackup(user.id, backup)],
    ]);
    const first = await request('/auth/password', { identifier: user.phone, password });
    const other = await request('/auth/password', { identifier: user.phone, password });
    const connection = await admin.pool.connect();
    await connection.query('begin');
    await connection.query('select id from users where id=$1 for update', [user.id]);
    const attempts = [first, other].map((response) =>
      request('/auth/totp', { challengeId: response.json().challengeId, code: backup }),
    );
    const running = Promise.all(attempts);
    try {
      await vi.waitFor(async () => {
        const waiting = await admin.pool.query(
          "select count(*)::int as count from pg_stat_activity where wait_event_type='Lock' and query like '%users%' and pid <> pg_backend_pid()",
        );
        expect(waiting.rows[0].count).toBeGreaterThanOrEqual(2);
      });
    } finally {
      await connection.query('commit');
      connection.release();
    }
    const results = await running;
    expect(results.map((result) => result.statusCode).sort()).toEqual([204, 400]);
    const stored = await admin.pool.query('select backup_code_hashes from users where id=$1', [
      user.id,
    ]);
    expect(stored.rows[0].backup_code_hashes).toEqual([]);
  });
  it.each(['password', 'google'])(
    'counts wrong second factors after %s in shared C1 and alerts the verified phone',
    async (method) => {
      const user = await seed();
      const subject = randomUUID();
      await admin.pool.query('update users set google_subject=$2 where id=$1', [user.id, subject]);
      const first =
        method === 'password'
          ? await request('/auth/password', { identifier: user.phone, password })
          : await request('/auth/google', {
              idToken: `fake-google:${JSON.stringify({ sub: subject, email: 'person@gmail.com', email_verified: true })}`,
            });
      const wrong = token() === '000000' ? '111111' : '000000';
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await request('/auth/totp', {
          challengeId: first.json().challengeId,
          code: wrong,
        });
        expect(result.statusCode).toBe(attempt === 4 ? 429 : 400);
      }
      expect(
        (await request('/auth/password', { identifier: user.phone, password })).statusCode,
      ).toBe(429);
      expect(await app.get(ValkeyClient).connection.get(authKey('fail-user', user.id))).toBe('5');
    },
  );
  it('invalidates pending challenges when sessions are revoked', async () => {
    const user = await seed();
    const first = await request('/auth/password', { identifier: user.phone, password });
    await app.get(SessionsService).revokeAll(user.id, '192.0.2.1');
    expect(
      (await request('/auth/totp', { challengeId: first.json().challengeId, code: token() }))
        .statusCode,
    ).toBe(400);
  });
  it('requires every existing non-TOTP factor for recovery', async () => {
    const user = await seed();
    const email = `${randomUUID()}@example.test`;
    await admin.pool.query('update users set email=$2,email_verified_at=$3 where id=$1', [
      user.id,
      email,
      now,
    ]);
    const result = await request('/auth/totp/recovery', { phone: user.phone, phoneCode: '123456' });
    expect(result.statusCode).toBe(403);
    expect(
      (await admin.pool.query('select id from account_recoveries where user_id=$1', [user.id]))
        .rows,
    ).toHaveLength(0);
  });
  it('waits seven days after notices, removes TOTP without a session, and rejects reuse', async () => {
    const user = await seed();
    const started = await recovery(user);
    expect(started.eligibleAt).not.toBeNull();
    const payload = { recoveryId: started.recoveryId, token: started.completionToken };
    expect((await request('/auth/totp/recovery/complete', payload)).statusCode).toBe(409);
    const previous = now;
    now = new Date(new Date(started.eligibleAt!).getTime() - 1);
    expect((await request('/auth/totp/recovery/complete', payload)).statusCode).toBe(409);
    now = new Date(now.getTime() + 1);
    const done = await request('/auth/totp/recovery/complete', payload);
    expect(done.statusCode, done.body).toBe(204);
    expect(done.headers['set-cookie']).toBeUndefined();
    expect(
      (await admin.pool.query('select totp_enabled_at from users where id=$1', [user.id])).rows[0]
        .totp_enabled_at,
    ).toBeNull();
    expect((await request('/auth/totp/recovery/complete', payload)).statusCode).toBe(400);
    now = previous;
  });
  it('cancels recovery on a completed TOTP sign-in', async () => {
    const user = await seed();
    const started = await recovery(user);
    const first = await request('/auth/password', { identifier: user.phone, password });
    expect(
      (await request('/auth/totp', { challengeId: first.json().challengeId, code: token() }))
        .statusCode,
    ).toBe(204);
    expect(
      (
        await admin.pool.query('select status from account_recoveries where id=$1', [
          started.recoveryId,
        ])
      ).rows[0].status,
    ).toBe('cancelled');
    expect(
      (
        await request('/auth/totp/recovery/complete', {
          recoveryId: started.recoveryId,
          token: started.completionToken,
        })
      ).statusCode,
    ).toBe(400);
  });
  it('keeps recovery ineligible when a notice fails and opens a full window after retry', async () => {
    const user = await seed();
    expect(
      (await request('/auth/totp/recovery/code', { phone: user.phone, method: 'phone' }))
        .statusCode,
    ).toBe(204);
    const failure = vi
      .spyOn(MailpitSmsDriver.prototype, 'send')
      .mockRejectedValueOnce(new Error('unavailable'));
    const started = await request('/auth/totp/recovery', {
      phone: user.phone,
      phoneCode: codeFor(user.phone),
      password,
    });
    expect(started.statusCode).toBe(202);
    expect(started.json().eligibleAt).toBeNull();
    await admin.pool.query(
      'update account_security_notices set retry_at=clock_timestamp() where user_id=$1',
      [user.id],
    );
    await app.get(SecurityNoticesService).dispatch(user.id);
    const row = await admin.pool.query('select eligible_at from account_recoveries where id=$1', [
      started.json().recoveryId,
    ]);
    expect(row.rows[0].eligible_at.getTime()).toBe(now.getTime() + 7 * 86400000);
    failure.mockClear();
  });
  it('lists own sessions, signs out others, and removes access immediately', async () => {
    const user = await seed(false);
    const sessions = app.get(SessionsService);
    const first = await sessions.create(user.id, {
      isRemembered: false,
      ip: '192.0.2.1',
      userAgent: 'Mozilla Firefox/1 Linux',
    });
    const other = await sessions.create(user.id, { isRemembered: false, ip: '192.0.2.2' });
    const cookie = `dakly_session=${first.token}`;
    const listed = await request('/me/sessions', undefined, cookie, 'GET');
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.session.id,
          isCurrent: true,
          device: 'Firefox on Linux',
        }),
      ]),
    );
    expect(
      (await request(`/me/sessions/${other.session.id}`, undefined, cookie, 'DELETE')).statusCode,
    ).toBe(204);
    expect(await sessions.resolve(other.token)).toBeUndefined();
    const profile = await request('/me', undefined, cookie, 'GET');
    expect(profile.json()).toMatchObject({
      hasPassword: true,
      isTotpEnabled: false,
      isPhoneVerified: true,
    });
    expect(JSON.stringify(profile.json())).not.toContain('passwordHash');
  });

  it('rejects another account authenticator and still permits the rightful second factor', async () => {
    const otherSecret = new Secret({ size: 20 }).base32;
    const user = await seed(true, otherSecret);
    const first = await request('/auth/password', { identifier: user.phone, password });
    const wrong = await request('/auth/totp', {
      challengeId: first.json().challengeId,
      code: token(),
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    const correct = new TOTP({ secret: Secret.fromBase32(otherSecret) }).generate({
      timestamp: now.getTime(),
    });
    expect(
      (await request('/auth/totp', { challengeId: first.json().challengeId, code: correct }))
        .statusCode,
    ).toBe(204);
  });
  it('sets up encrypted TOTP with a fresh password and disables it with one backup code', async () => {
    const user = await seed(false);
    const session = await app.get(SessionsService).create(user.id, { isRemembered: false });
    const cookie = `dakly_session=${session.token}`;
    expect(
      (await request('/me/totp/setup', { currentPassword: 'wrong-pass' }, cookie)).statusCode,
    ).toBe(401);
    const setup = await request('/me/totp/setup', { currentPassword: password }, cookie);
    expect(setup.statusCode, setup.body).toBe(200);
    const setupSecret = new URL(setup.json().uri).searchParams.get('secret')!;
    const setupCode = new TOTP({ secret: Secret.fromBase32(setupSecret) }).generate({
      timestamp: now.getTime(),
    });
    const confirmed = await request(
      '/me/totp/confirm',
      { setupId: setup.json().setupId, code: setupCode },
      cookie,
    );
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(confirmed.json().backupCodes).toHaveLength(10);
    const row = (
      await admin.pool.query(
        'select totp_secret_ciphertext,totp_key_version,backup_code_hashes from users where id=$1',
        [user.id],
      )
    ).rows[0];
    expect(row.totp_secret_ciphertext.toString()).not.toContain(setupSecret);
    expect(row.totp_key_version).toBe(1);
    expect(row.backup_code_hashes).not.toContain(confirmed.json().backupCodes[0]);
    expect(
      (await request('/me/totp/disable', { code: confirmed.json().backupCodes[0] }, cookie))
        .statusCode,
    ).toBe(204);
    expect(
      (await request('/me/totp/disable', { code: confirmed.json().backupCodes[0] }, cookie))
        .statusCode,
    ).toBe(400);
    const events = await admin.pool.query(
      'select event from account_security_events where user_id=$1 order by id',
      [user.id],
    );
    expect(events.rows.map((row) => row.event)).toEqual(['totp.enabled', 'totp.disabled']);
  });
  it('accepts a cancellation link token but never uses it to complete recovery', async () => {
    const user = await seed();
    const started = await recovery(user);
    const notice = messages.findLast(
      (message) => message.to === user.phone && message.text.includes('cancelToken='),
    )!;
    const cancelToken = notice.text.match(/cancelToken=([A-Za-z0-9_-]+)/)![1];
    expect(cancelToken).not.toBe(started.completionToken);
    const payload = { recoveryId: started.recoveryId, token: cancelToken };
    expect((await request('/auth/totp/recovery/complete', payload)).statusCode).toBe(400);
    expect((await request('/auth/totp/recovery/cancel', payload)).statusCode).toBe(204);
    expect(
      (
        await admin.pool.query('select status from account_recoveries where id=$1', [
          started.recoveryId,
        ])
      ).rows[0].status,
    ).toBe('cancelled');
    const stored = await admin.pool.query(
      'select cancel_hash,completion_hash from account_recoveries where id=$1',
      [started.recoveryId],
    );
    expect(JSON.stringify(stored.rows)).not.toContain(cancelToken);
    expect(JSON.stringify(stored.rows)).not.toContain(started.completionToken);
    const notices = await admin.pool.query(
      'select ciphertext from account_security_notices where recovery_id=$1',
      [started.recoveryId],
    );
    expect(notices.rows.every((row) => !row.ciphertext.toString().includes(cancelToken))).toBe(
      true,
    );
  });
  it('rejects recovery completion after credential state changes', async () => {
    const user = await seed();
    const started = await recovery(user);
    await app.get(SessionsService).revokeAll(user.id, '192.0.2.1');
    const previous = now;
    now = new Date(new Date(started.eligibleAt!).getTime() + 1);
    const result = await request('/auth/totp/recovery/complete', {
      recoveryId: started.recoveryId,
      token: started.completionToken,
    });
    expect(result.statusCode).toBe(400);
    now = previous;
    expect(
      (await admin.pool.query('select totp_enabled_at from users where id=$1', [user.id])).rows[0]
        .totp_enabled_at,
    ).not.toBeNull();
  });
  it('rejects owner enumeration overflow before any recovery mutation', async () => {
    const user = await seed();
    await request('/auth/totp/recovery/code', { phone: user.phone, method: 'phone' });
    const owners = vi.spyOn(app.get(TeamService), 'accountOwnerContacts').mockResolvedValueOnce(
      Array.from({ length: 1001 }, () => ({
        userId: randomUUID(),
        phone: '01712345678',
        email: null,
      })),
    );
    const result = await request('/auth/totp/recovery', {
      phone: user.phone,
      phoneCode: codeFor(user.phone),
      password,
    });
    expect(result.json().error.code).toBe('AUTH_RECOVERY_OWNER_LIMIT');
    const counts = await admin.pool.query(
      'select (select count(*) from account_recoveries where user_id=$1)::int as recoveries,(select count(*) from account_security_notices where user_id=$1)::int as notices,(select count(*) from account_security_events where user_id=$1)::int as events',
      [user.id],
    );
    expect(counts.rows[0]).toEqual({ recoveries: 0, notices: 0, events: 0 });
    owners.mockRestore();
  });
  it('does not invalidate challenges or audit a missing session deletion', async () => {
    const user = await seed();
    const first = await request('/auth/password', { identifier: user.phone, password });
    await app.get(SessionsService).revoke(user.id, randomUUID());
    expect(
      (await admin.pool.query('select security_version from users where id=$1', [user.id])).rows[0]
        .security_version,
    ).toBe(0);
    expect(
      (await admin.pool.query('select id from account_security_events where user_id=$1', [user.id]))
        .rows,
    ).toHaveLength(0);
    expect(
      (await request('/auth/totp', { challengeId: first.json().challengeId, code: token() }))
        .statusCode,
    ).toBe(204);
  });
  it('notifies a disabled store Owner through their verified contact', async () => {
    const user = await seed();
    const owner = await seed(false);
    const storeId = randomUUID();
    await admin.pool.query('update users set is_disabled=true where id=$1', [owner.id]);
    await admin.pool.query('insert into stores(id,name) values($1,$2)', [
      storeId,
      'Security test store',
    ]);
    try {
      await admin.pool.query(
        "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'owner','active'),(gen_random_uuid(),$1,$3,'support_agent','active')",
        [storeId, owner.id, user.id],
      );
      const started = await recovery(user);
      expect(started.eligibleAt).not.toBeNull();
      expect(
        messages.some(
          (message) => message.to === owner.phone && message.text.includes('cancelToken='),
        ),
      ).toBe(true);
    } finally {
      await admin.pool.query('delete from memberships where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
    }
  });
  it.each(['confirm', 'disable'])(
    'locks authenticated %s after five wrong factors without resetting C1',
    async (operation) => {
      const user = await seed(operation === 'disable');
      const session = await app.get(SessionsService).create(user.id, { isRemembered: false });
      const cookie = `dakly_session=${session.token}`;
      let setupId: string | undefined;
      let wrong = token() === '000000' ? '111111' : '000000';
      if (operation === 'confirm') {
        const setup = await request('/me/totp/setup', { currentPassword: password }, cookie);
        setupId = setup.json().setupId;
        const setupSecret = new URL(setup.json().uri).searchParams.get('secret')!;
        const generated = new TOTP({ secret: Secret.fromBase32(setupSecret) });
        const disallowed = [-30000, 0, 30000].map((offset) =>
          generated.generate({ timestamp: now.getTime() + offset }),
        );
        wrong = ['000000', '111111', '222222', '333333'].find(
          (value) => !disallowed.includes(value),
        )!;
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await request(
          `/me/totp/${operation}`,
          { ...(setupId ? { setupId } : {}), code: wrong },
          cookie,
        );
        expect(result.statusCode).toBe(attempt === 4 ? 429 : 400);
      }
      expect(await app.get(ValkeyClient).connection.get(authKey('fail-user', user.id))).toBe('5');
      expect(
        (
          await request(
            `/me/totp/${operation}`,
            { ...(setupId ? { setupId } : {}), code: token() },
            cookie,
          )
        ).statusCode,
      ).toBe(429);
    },
  );
  it('completes password reset only through the second-factor gate', async () => {
    const user = await seed();
    await request('/auth/password-reset', { identifier: user.phone });
    const reset = await request('/auth/password-reset/confirm', {
      identifier: user.phone,
      code: codeFor(user.phone),
      password: 'changed-password123',
    });
    expect(reset.statusCode, reset.body).toBe(202);
    expect(reset.headers['set-cookie']).toBeUndefined();
    expect(
      (await request('/auth/totp', { challengeId: reset.json().challengeId, code: token() }))
        .statusCode,
    ).toBe(204);
  });
  it('does not issue two sessions for parallel submissions of one challenge', async () => {
    const user = await seed();
    const first = await request('/auth/password', { identifier: user.phone, password });
    const connection = await admin.pool.connect();
    await connection.query('begin');
    await connection.query('select id from users where id=$1 for update', [user.id]);
    const payload = { challengeId: first.json().challengeId, code: token() };
    const attempts = Promise.all([request('/auth/totp', payload), request('/auth/totp', payload)]);
    try {
      await vi.waitFor(async () => {
        const waiting = await admin.pool.query(
          "select count(*)::int as count from pg_stat_activity where wait_event_type='Lock' and query like '%users%' and pid <> pg_backend_pid()",
        );
        expect(waiting.rows[0].count).toBe(1);
      });
    } finally {
      await connection.query('commit');
      connection.release();
    }
    expect((await attempts).map((result) => result.statusCode).sort()).toEqual([204, 400]);
    expect(
      (
        await admin.pool.query('select count(*)::int as count from sessions where user_id=$1', [
          user.id,
        ])
      ).rows[0].count,
    ).toBe(1);
  });
  it('claims bounded notice batches and rejects an acknowledgement from an expired lease', async () => {
    const user = await seed(false);
    const notices = app.get(SecurityNoticesService);
    const repository = app.get(SecurityNoticesRepository);
    await notices.enqueue(
      user.id,
      Array.from({ length: 21 }, () => ({
        channel: 'sms' as const,
        to: user.phone,
        text: 'Account security notice',
      })),
    );
    const first = await repository.claim(user.id);
    expect(first).toHaveLength(20);
    const next = await repository.claim(user.id);
    expect(next).toHaveLength(1);
    expect(await repository.claim(user.id)).toHaveLength(0);
    await admin.pool.query(
      "update account_security_notices set lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [first[0]!.id],
    );
    const reclaimed = await repository.claim(user.id);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]!.leaseId).not.toBe(first[0]!.leaseId);
    expect(await repository.delivered(first[0]!, now)).toBe(false);
    expect(await repository.delivered(reclaimed[0]!, now)).toBe(true);
  });
});
