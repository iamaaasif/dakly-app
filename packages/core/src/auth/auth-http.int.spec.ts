import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { SessionsService } from '../sessions/sessions.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { UsersRepository } from './users.repository';
import { SignInFailures } from './sign-in-failures';
import { authKey } from './auth-key';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(TestModule);

const fake = new FakeSmsDriver();
describe('SMS authentication over Fastify', () => {
  let app: NestFastifyApplication;
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const phones: string[] = [];
  const origin = 'http://localhost:3000';
  const ip = `2001:db8::${randomInt(1, 65535).toString(16)}`;
  const phone = () => {
    const value = `017${randomInt(10000000, 99999999)}`;
    phones.push(value);
    return value;
  };
  const request = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers: { origin }, payload, remoteAddress: ip });
  const registration = () => ({
    purpose: 'sign_up',
    phone: phone(),
    name: 'রিনা',
    email: `${randomUUID()}@example.test`,
    termsVersion: '2026-11',
  });
  const codeFor = (target: string) =>
    fake.messages.findLast((message) => message.to === target)!.text.match(/\b\d{6}\b/)![0];
  beforeAll(async () => {
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) =>
      fake.send(message),
    );
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    const identities = await admin.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.phone, phones));
    const keys = phones.flatMap((target) =>
      ['resend', 'send-target', 'fail-target', 'code:sign_up', 'code:sign_in'].map((kind) =>
        authKey(kind, target),
      ),
    );
    keys.push(
      ...identities.map((user) => authKey('fail-user', user.id)),
      authKey('send-ip', ip),
      authKey('fail-ip', ip),
    );
    for (const message of fake.messages) {
      const code = message.text.match(/\b\d{6}\b/)?.[0];
      if (code)
        for (const purpose of ['sign_up', 'sign_in'])
          keys.push(authKey('consumed', JSON.stringify([message.to, purpose, code])));
    }
    await app.get(ValkeyClient).connection.del(...keys);
    await admin.pool.query('delete from account_security_events where user_id = any($1::uuid[])', [
      identities.map((user) => user.id),
    ]);
    await admin.db.delete(users).where(inArray(users.phone, phones));
    await admin.pool.end();
    await app?.close();
    vi.restoreAllMocks();
  });
  it('sets an initial Argon2id password only after consuming signup phone proof', async () => {
    const input = registration();
    await request('/auth/code', input);
    const cached = await app
      .get(ValkeyClient)
      .connection.hgetall(authKey('code:sign_up', input.phone));
    expect(JSON.stringify(cached)).not.toContain('initialpass1');
    const response = await request('/auth/code/verify', {
      purpose: 'sign_up',
      phone: input.phone,
      code: codeFor(input.phone),
      password: 'initialpass1',
    });
    expect(response.statusCode).toBe(204);
    const [user] = await admin.db.select().from(users).where(eq(users.phone, input.phone));
    expect(user!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    expect(
      (await request('/auth/password', { identifier: input.phone, password: 'initialpass1' }))
        .statusCode,
    ).toBe(204);
  });
  it('rejects an unknown sign-in phone without sending an SMS', async () => {
    const before = fake.messages.length;
    const response = await request('/auth/code', { purpose: 'sign_in', phone: phone() });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('AUTH_ACCOUNT_NOT_FOUND');
    expect(fake.messages).toHaveLength(before);
  });
  it('creates one verified phone account and storeless session from parallel verifies', async () => {
    const input = registration();
    expect((await request('/auth/code', input)).statusCode).toBe(204);
    const payload = {
      purpose: 'sign_up',
      phone: input.phone,
      code: codeFor(input.phone),
      isRemembered: true,
    };
    const responses = await Promise.all([
      request('/auth/code/verify', payload),
      request('/auth/code/verify', payload),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([204, 400]);
    const cookie = String(
      responses.find((response) => response.statusCode === 204)!.headers['set-cookie'],
    );
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=2592000');
    const [user] = await admin.db.select().from(users).where(eq(users.phone, input.phone));
    expect(user).toMatchObject({
      name: input.name,
      email: input.email,
      emailVerifiedAt: null,
      termsVersion: '2026-11',
    });
    expect(user!.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(user!.termsAcceptedAt).toBeInstanceOf(Date);
    const devices = await admin.db.select().from(sessions).where(eq(sessions.userId, user!.id));
    expect(devices).toHaveLength(1);
    expect(devices[0]!.activeStoreId).toBeNull();
    const me = await app.inject({ url: '/me', headers: { cookie: cookie.split(';')[0]! } });
    expect(me.json()).toMatchObject({
      id: user!.id,
      name: input.name,
      phone: input.phone,
      email: input.email,
    });
    expect((await request('/auth/code', input)).json().error.code).toBe('AUTH_ACCOUNT_EXISTS');
  });
  it('rejects altered verification payloads and missing origins at the edge', async () => {
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/auth/code',
      payload: registration(),
    });
    expect(noOrigin.statusCode).toBe(403);
    const response = await request('/auth/code/verify', {
      purpose: 'sign_up',
      phone: phone(),
      code: '123456',
      emailVerifiedAt: '2026-01-01',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });
  it('requires the second factor for a TOTP-enabled account and issues no session', async () => {
    const target = phone();
    const [user] = await admin.db
      .insert(users)
      .values({ name: 'Karim', phone: target, totpEnabledAt: new Date() })
      .returning();
    expect((await request('/auth/code', { purpose: 'sign_in', phone: target })).statusCode).toBe(
      204,
    );
    const response = await request('/auth/code/verify', {
      purpose: 'sign_in',
      phone: target,
      code: codeFor(target),
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('totp_required');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, user!.id)),
    ).toHaveLength(0);
  });
  it('rejects a code after the target moves to another account', async () => {
    const target = phone();
    const moved = phone();
    const [original] = await admin.db
      .insert(users)
      .values({ name: 'Rina', phone: target })
      .returning();
    expect((await request('/auth/code', { purpose: 'sign_in', phone: target })).statusCode).toBe(
      204,
    );
    const code = codeFor(target);
    await admin.db.update(users).set({ phone: moved }).where(eq(users.id, original!.id));
    const [replacement] = await admin.db
      .insert(users)
      .values({ name: 'Karim', phone: target })
      .returning();
    const response = await request('/auth/code/verify', {
      purpose: 'sign_in',
      phone: target,
      code,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('AUTH_CODE_INVALID');
    expect(
      await admin.db
        .select()
        .from(sessions)
        .where(inArray(sessions.userId, [original!.id, replacement!.id])),
    ).toHaveLength(0);
  });

  it('rolls back a new user when session creation fails and never reactivates the code', async () => {
    const input = registration();
    expect((await request('/auth/code', input)).statusCode).toBe(204);
    const payload = { purpose: 'sign_up', phone: input.phone, code: codeFor(input.phone) };
    const sessionsService = app.get(SessionsService);
    const createSession = sessionsService.create.bind(sessionsService);
    let rolledBackSessionId = '';
    const create = vi.spyOn(sessionsService, 'create').mockImplementationOnce(async (...args) => {
      const result = await createSession(...args);
      rolledBackSessionId = result.session.id;
      throw new Error('session storage unavailable');
    });
    const response = await request('/auth/code/verify', payload);
    create.mockRestore();
    expect(response.statusCode).toBe(500);
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.id, rolledBackSessionId)),
    ).toHaveLength(0);
    expect(await admin.db.select().from(users).where(eq(users.phone, input.phone))).toHaveLength(0);
    expect((await request('/auth/code/verify', payload)).json().error.code).toBe(
      'AUTH_CODE_INVALID',
    );
  });

  it('does not reserve an unverified signup email against another account', async () => {
    const existing = registration();
    await admin.db
      .insert(users)
      .values({ name: existing.name, phone: existing.phone, email: existing.email });
    const input = { ...registration(), email: existing.email.toUpperCase() };
    expect((await request('/auth/code', input)).statusCode).toBe(204);
    const response = await request('/auth/code/verify', {
      purpose: 'sign_up',
      phone: input.phone,
      code: codeFor(input.phone),
    });
    expect(response.statusCode).toBe(204);
    const [created] = await admin.db.select().from(users).where(eq(users.phone, input.phone));
    expect(created!.emailVerifiedAt).toBeNull();
  });
  it('signs into the same account after signup and clears user failures after commit', async () => {
    const input = registration();
    expect((await request('/auth/code', input)).statusCode).toBe(204);
    expect(
      (
        await request('/auth/code/verify', {
          purpose: 'sign_up',
          phone: input.phone,
          code: codeFor(input.phone),
        })
      ).statusCode,
    ).toBe(204);
    const [user] = await admin.db.select().from(users).where(eq(users.phone, input.phone));
    const subject = { userId: user!.id, target: input.phone, phone: input.phone };
    const failures = app.get(SignInFailures);
    for (let attempt = 0; attempt < 4; attempt++) await failures.recordFailure(subject, ip);
    await app.get(ValkeyClient).connection.del(authKey('resend', input.phone));
    expect(
      (await request('/auth/code', { purpose: 'sign_in', phone: input.phone })).statusCode,
    ).toBe(204);
    const response = await request('/auth/code/verify', {
      purpose: 'sign_in',
      phone: input.phone,
      code: codeFor(input.phone),
    });
    expect(response.statusCode).toBe(204);
    expect(String(response.headers['set-cookie'])).not.toContain('Max-Age');
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, user!.id)),
    ).toHaveLength(2);
    expect(await app.get(ValkeyClient).connection.get(authKey('fail-user', user!.id))).toBeNull();
    expect(await app.get(ValkeyClient).connection.get(authKey('fail-ip', ip))).not.toBeNull();
  });

  it('rechecks the current phone when recovery races the initial lookup', async () => {
    const target = phone();
    const moved = phone();
    const [user] = await admin.db.insert(users).values({ name: 'Rina', phone: target }).returning();
    expect((await request('/auth/code', { purpose: 'sign_in', phone: target })).statusCode).toBe(
      204,
    );
    const repository = app.get(UsersRepository);
    const lock = repository.lockForSignIn.bind(repository);
    const race = vi.spyOn(repository, 'lockForSignIn').mockImplementationOnce(async (id) => {
      await admin.db.update(users).set({ phone: moved }).where(eq(users.id, user!.id));
      return lock(id);
    });
    const response = await request('/auth/code/verify', {
      purpose: 'sign_in',
      phone: target,
      code: codeFor(target),
    });
    race.mockRestore();
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('AUTH_CODE_INVALID');
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, user!.id)),
    ).toHaveLength(0);
  });
  it('issues exactly one session without locking after four failures and parallel correct submissions', async () => {
    const target = phone();
    const [user] = await admin.db.insert(users).values({ name: 'Rina', phone: target }).returning();
    expect((await request('/auth/code', { purpose: 'sign_in', phone: target })).statusCode).toBe(
      204,
    );
    const subject = { userId: user!.id, target, phone: target };
    for (let attempt = 0; attempt < 4; attempt++)
      await app.get(SignInFailures).recordFailure(subject, ip);
    const payload = { purpose: 'sign_in', phone: target, code: codeFor(target) };
    const responses = await Promise.all([
      request('/auth/code/verify', payload),
      request('/auth/code/verify', payload),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([204, 400]);
    expect(await app.get(ValkeyClient).connection.get(authKey('fail-user', user!.id))).toBeNull();
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, user!.id)),
    ).toHaveLength(1);
  });
  it('refuses sign-in by an unverified email without issuing a session', async () => {
    const input = registration();
    await admin.db
      .insert(users)
      .values({ name: input.name, phone: input.phone, email: input.email });
    const response = await request('/auth/email/code', { email: input.email });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('AUTH_ACCOUNT_NOT_FOUND');
  });
});
