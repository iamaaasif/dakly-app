import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';
import { SmtpEmailDriver } from '@dakly/providers/email/smtp/smtp-email-driver';
import type { EmailMessage } from '@dakly/providers/email/email-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { AuthModule } from './auth.module';
import { UsersRepository } from './users.repository';
import { DatabaseModule } from '../platform/database/database.module';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsService } from '../sessions/sessions.service';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { authKey } from './auth-key';

class EmailTestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(EmailTestModule);

describe('Email authentication over Fastify', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const sms = new FakeSmsDriver();
  const messages: EmailMessage[] = [];
  const ids: string[] = [];
  const targets = new Set<string>();
  const ips = new Set<string>();
  let app: NestFastifyApplication;
  const address = () => {
    const email = `${randomUUID()}@example.test`;
    targets.add(email);
    return email;
  };
  const codeFor = (to: string) =>
    [...sms.messages, ...messages]
      .findLast((message) => message.to === to)!
      .text.match(/\b\d{6}\b/)![0];
  const post = (url: string, payload: object, cookie?: string) => {
    const ip = `2001:db8::${randomInt(1, 65535).toString(16)}`;
    ips.add(ip);
    return app.inject({
      method: 'POST',
      url,
      headers: { origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) },
      payload,
      remoteAddress: ip,
    });
  };
  async function account(verified = true) {
    const phone = `018${randomInt(10000000, 99999999)}`;
    targets.add(phone);
    const [user] = await admin.db
      .insert(users)
      .values({
        name: 'রিনা',
        phone,
        phoneVerifiedAt: new Date(),
        email: address(),
        emailVerifiedAt: verified ? new Date() : null,
      })
      .returning();
    ids.push(user!.id);
    const session = await app
      .get(SessionsService)
      .create(user!.id, { ip: '192.0.2.1', isRemembered: false });
    return { ...user!, cookie: `dakly_session=${session.token}` };
  }
  async function beginChange(user: Awaited<ReturnType<typeof account>>, email = address()) {
    targets.add(JSON.stringify([user.phone, JSON.stringify([user.id, email])]));
    targets.add(JSON.stringify([email, user.id]));
    expect((await post('/me/email/proof', { email }, user.cookie)).statusCode).toBe(204);
    expect(
      (await post('/me/email', { email, proofCode: codeFor(user.phone!) }, user.cookie)).statusCode,
    ).toBe(204);
    return { email, code: codeFor(email) };
  }
  beforeAll(async () => {
    vi.spyOn(SmtpEmailDriver.prototype, 'send').mockImplementation(async (message) => {
      messages.push(message);
    });
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) => sms.send(message));
    app = await NestFactory.create<NestFastifyApplication>(EmailTestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    const keys = [...targets].flatMap((target) =>
      [
        'resend',
        'send-target',
        'fail-target',
        'code:sign_in',
        'code:add_email',
        'code:email_change_proof',
      ].map((kind) => authKey(kind, target)),
    );
    for (const message of [...sms.messages, ...messages]) {
      const code = message.text.match(/\b\d{6}\b/)?.[0];
      if (!code) continue;
      for (const target of targets)
        keys.push(
          ...['sign_in', 'add_email', 'email_change_proof'].map((purpose) =>
            authKey('consumed', JSON.stringify([target, purpose, code])),
          ),
        );
    }

    keys.push(
      ...ids.map((id) => authKey('fail-user', id)),
      ...[...ips].flatMap((ip) => [authKey('fail-ip', ip), authKey('send-ip', ip)]),
    );
    if (keys.length) await app.get(ValkeyClient).connection.del(...keys);
    await admin.pool.query('delete from account_security_events where user_id = any($1::uuid[])', [
      ids,
    ]);
    if (ids.length) await admin.db.delete(users).where(inArray(users.id, ids));
    await admin.pool.end();
    await app.close();
    vi.restoreAllMocks();
  });
  it('signs in by case-insensitive verified email and consumes the code once', async () => {
    const user = await account();
    expect((await post('/auth/email/code', { email: user.email!.toUpperCase() })).statusCode).toBe(
      204,
    );
    const payload = { email: user.email!, code: codeFor(user.email!) };
    const results = await Promise.all([
      post('/auth/email/code/verify', payload),
      post('/auth/email/code/verify', payload),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([204, 400]);
    expect(results.find((result) => result.statusCode === 204)!.headers['set-cookie']).toContain(
      'HttpOnly',
    );
  });
  it('routes phone sign-in to the verified email and refuses a stale delivery identity', async () => {
    const user = await account();
    const before = sms.messages.length;
    expect((await post('/auth/code', { purpose: 'sign_in', phone: user.phone })).statusCode).toBe(
      204,
    );
    expect(sms.messages).toHaveLength(before);
    const code = codeFor(user.email!);
    await admin.db.update(users).set({ email: address() }).where(eq(users.id, user.id));
    const response = await post('/auth/code/verify', {
      purpose: 'sign_in',
      phone: user.phone,
      code,
    });
    expect(response.json().error.code).toBe('AUTH_CODE_INVALID');
  });
  it('rechecks email ownership under the completion lock', async () => {
    const user = await account();
    await post('/auth/email/code', { email: user.email });
    const repository = app.get(UsersRepository);
    const lock = repository.lockForSignIn.bind(repository);
    vi.spyOn(repository, 'lockForSignIn').mockImplementationOnce(async (id) => {
      await admin.db.update(users).set({ email: address() }).where(eq(users.id, user.id));
      return lock(id);
    });
    expect(
      (
        await post('/auth/email/code/verify', { email: user.email, code: codeFor(user.email!) })
      ).json().error.code,
    ).toBe('AUTH_CODE_INVALID');
  });
  it('does not send sign-in codes to unverified email', async () => {
    const user = await account(false);
    const before = messages.length;
    expect((await post('/auth/email/code', { email: user.email })).json().error.code).toBe(
      'AUTH_ACCOUNT_NOT_FOUND',
    );
    expect(messages).toHaveLength(before);
  });
  it('requires a session and fresh existing-method proof before sending to a proposed address', async () => {
    const user = await account();
    const email = address();
    const before = messages.length;
    expect((await post('/me/email/proof', { email })).statusCode).toBe(401);
    expect((await post('/me/email', { email, proofCode: '000000' }, user.cookie)).statusCode).toBe(
      400,
    );
    expect(messages).toHaveLength(before);
  });
  it('keeps the old email until new-address verification then audits one atomic change', async () => {
    const user = await account();
    const change = await beginChange(user);
    expect((await admin.db.select().from(users).where(eq(users.id, user.id)))[0]!.email).toBe(
      user.email,
    );
    expect((await post('/me/email/verify', change, user.cookie)).statusCode).toBe(204);
    const [updated] = await admin.db.select().from(users).where(eq(users.id, user.id));
    expect(updated!.email).toBe(change.email);
    expect(updated!.emailVerifiedAt).toBeInstanceOf(Date);
    const events = await admin.pool.query(
      'select event, actor_type from account_security_events where user_id=$1',
      [user.id],
    );
    expect(events.rows).toEqual([{ event: 'email.changed', actor_type: 'user' }]);
    expect((await post('/me/email/verify', change, user.cookie)).statusCode).toBe(400);
  });
  it('binds both proof and new-address codes to the user and requested address', async () => {
    const user = await account();
    const other = await account();
    const change = await beginChange(user);
    expect(
      (await post('/me/email/verify', { ...change, email: address() }, user.cookie)).statusCode,
    ).toBe(400);
    expect((await post('/me/email/verify', change, other.cookie)).statusCode).toBe(400);
    expect(
      (await post('/me/email', { email: address(), proofCode: codeFor(user.phone!) }, user.cookie))
        .statusCode,
    ).toBe(400);
    expect((await post('/me/email/verify', change, user.cookie)).statusCode).toBe(204);
  });
  it('rejects phone replacement after proof and preserves the old email', async () => {
    const user = await account();
    const change = await beginChange(user);
    const moved = `019${randomInt(10000000, 99999999)}`;
    targets.add(moved);
    await admin.db.update(users).set({ phone: moved }).where(eq(users.id, user.id));
    expect((await post('/me/email/verify', change, user.cookie)).json().error.code).toBe(
      'AUTH_PROOF_REQUIRED',
    );
    expect((await admin.db.select().from(users).where(eq(users.id, user.id)))[0]!.email).toBe(
      user.email,
    );
  });
  it('returns an email conflict and preserves both accounts', async () => {
    const user = await account();
    const other = await account();
    const change = await beginChange(user, other.email!);
    const response = await post('/me/email/verify', change, user.cookie);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('AUTH_EMAIL_TAKEN');
  });
  it('rolls back an email update when its audit fails', async () => {
    const user = await account();
    const change = await beginChange(user);
    vi.spyOn(app.get(AccountSecurityEventsService), 'record').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    expect((await post('/me/email/verify', change, user.cookie)).statusCode).toBe(500);
    expect((await admin.db.select().from(users).where(eq(users.id, user.id)))[0]!.email).toBe(
      user.email,
    );
  });
  it('allows verified ownership despite another account having typed that unverified email', async () => {
    const unverified = await account(false);
    const owner = await account();
    const change = await beginChange(owner, unverified.email!);
    expect((await post('/me/email/verify', change, owner.cookie)).statusCode).toBe(204);
    expect(
      (await admin.db.select().from(users).where(eq(users.id, unverified.id)))[0]!.emailVerifiedAt,
    ).toBeNull();
    await app.get(ValkeyClient).connection.del(authKey('resend', change.email));
    expect((await post('/auth/email/code', { email: change.email })).statusCode).toBe(204);
    expect(
      (await post('/auth/email/code/verify', { email: change.email, code: codeFor(change.email) }))
        .statusCode,
    ).toBe(204);
    const ownerSessions = await admin.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, owner.id));
    expect(ownerSessions).toHaveLength(2);
  });
  it('allows only one verified owner when two accounts confirm the same address concurrently', async () => {
    const first = await account();
    const second = await account();
    const one = await beginChange(first);
    await app.get(ValkeyClient).connection.del(authKey('resend', one.email));
    const two = await beginChange(second, one.email);
    const responses = await Promise.all([
      post('/me/email/verify', one, first.cookie),
      post('/me/email/verify', two, second.cookie),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([204, 409]);
    expect(responses.find((response) => response.statusCode === 409)!.json().error.code).toBe(
      'AUTH_EMAIL_TAKEN',
    );
  });
  it('expires existing-method proof ten minutes after issuance, including the second verification step', async () => {
    const user = await account();
    const change = await beginChange(user);
    const clock = vi.spyOn(Clock.prototype, 'now').mockReturnValue(new Date(Date.now() + 600_001));
    const response = await post('/me/email/verify', change, user.cookie);
    clock.mockRestore();
    expect(response.json().error.code).toBe('AUTH_PROOF_REQUIRED');
  });
  it.each(['disabled', 'totp'])(
    'keeps the completion gate for email sign-in: %s',
    async (state) => {
      const user = await account();
      await admin.db
        .update(users)
        .set(state === 'disabled' ? { isDisabled: true } : { totpEnabledAt: new Date() })
        .where(eq(users.id, user.id));
      await post('/auth/email/code', { email: user.email });
      const response = await post('/auth/email/code/verify', {
        email: user.email,
        code: codeFor(user.email!),
      });
      expect(response.json().error.code).toBe(
        state === 'disabled' ? 'AUTH_DISABLED' : 'AUTH_SECOND_FACTOR_REQUIRED',
      );
      expect(
        await admin.db.select().from(sessions).where(eq(sessions.userId, user.id)),
      ).toHaveLength(1);
    },
  );

  it('shares phone and email failures, retains them on resend, and sends one email lock alert', async () => {
    const user = await account();
    await post('/auth/email/code', { email: user.email });
    const valid = codeFor(user.email!);
    const wrong = valid === '000000' ? '999999' : '000000';
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await post('/auth/email/code/verify', { email: user.email, code: wrong });
      expect(response.json().error.code).toBe('AUTH_CODE_INVALID');
    }
    await post('/auth/code', { purpose: 'sign_in', phone: user.phone });
    const phoneCode = codeFor(user.email!);
    const response = await post('/auth/code/verify', {
      purpose: 'sign_in',
      phone: user.phone,
      code: phoneCode === '000000' ? '999999' : '000000',
    });
    expect(response.json().error.code).toBe('AUTH_LOCKED');
    expect(
      (await post('/auth/email/code/verify', { email: user.email, code: valid })).json().error.code,
    ).toBe('AUTH_LOCKED');
    expect(
      messages.filter(
        (message) => message.to === user.email && message.subject === 'Dakly sign-in locked',
      ),
    ).toHaveLength(1);
  });
  it('rejects proof from a sign-in code and a phone which was replaced before proof submission', async () => {
    const user = await account(false);
    await post('/auth/code', { purpose: 'sign_in', phone: user.phone });
    const email = address();
    expect(
      (await post('/me/email', { email, proofCode: codeFor(user.phone!) }, user.cookie)).statusCode,
    ).toBe(400);
    await app.get(ValkeyClient).connection.del(authKey('resend', user.phone!));
    targets.add(JSON.stringify([user.phone, JSON.stringify([user.id, email])]));
    expect((await post('/me/email/proof', { email }, user.cookie)).statusCode).toBe(204);
    const proofCode = codeFor(user.phone!);
    const phone = `019${randomInt(10000000, 99999999)}`;
    targets.add(phone);
    await admin.db.update(users).set({ phone }).where(eq(users.id, user.id));
    expect((await post('/me/email', { email, proofCode }, user.cookie)).statusCode).toBe(400);
  });
  it('keeps the saved email code after uncertain delivery and sanitizes the failure', async () => {
    const user = await account();
    vi.spyOn(SmtpEmailDriver.prototype, 'send').mockRejectedValueOnce(
      new Error('private provider content'),
    );
    const response = await post('/auth/email/code', { email: user.email });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('AUTH_EMAIL_UNAVAILABLE');
    expect(response.body).not.toContain('private');
    expect(
      await app.get(ValkeyClient).connection.exists(authKey('code:sign_in', user.email!)),
    ).toBe(1);
    expect((await post('/auth/email/code', { email: user.email })).statusCode).toBe(429);
  });
});
