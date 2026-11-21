import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';
import type { EmailMessage } from '@dakly/providers/email/email-driver';
import { SmtpEmailDriver } from '@dakly/providers/email/smtp/smtp-email-driver';
import { FakeGoogleIdentityDriver } from '@dakly/providers/google/fake-google-identity-driver';
import { GoogleIdentityError } from '@dakly/providers/google/google-identity-driver';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsService } from '../sessions/sessions.service';
import { authKey } from './auth-key';
import { AuthModule } from './auth.module';
import { UsersRepository } from './users.repository';

class GoogleTestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(GoogleTestModule);

describe('Google authentication over Fastify', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const sms = new FakeSmsDriver();
  const messages: EmailMessage[] = [];
  const ids: string[] = [];
  const targets = new Set<string>();
  const ips = new Set<string>();
  const tickets = new Set<string>();
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
    if ('idToken' in payload && typeof payload.idToken === 'string')
      targets.add(authKey('google-token', payload.idToken));
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
  beforeAll(async () => {
    vi.spyOn(SmtpEmailDriver.prototype, 'send').mockImplementation(async (message) => {
      messages.push(message);
    });
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) => sms.send(message));
    app = await NestFactory.create<NestFastifyApplication>(GoogleTestModule, new FastifyAdapter(), {
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
        'code:sign_up',
        'code:google_email',
      ].map((kind) => authKey(kind, target)),
    );
    for (const message of [...sms.messages, ...messages]) {
      const code = message.text.match(/\b\d{6}\b/)?.[0];
      if (!code) continue;
      for (const target of targets)
        keys.push(
          ...['sign_in', 'sign_up', 'google_email', 'add_email', 'email_change_proof'].map(
            (purpose) => authKey('consumed', JSON.stringify([target, purpose, code])),
          ),
        );
    }

    keys.push(
      ...ids.map((id) => authKey('fail-user', id)),
      ...[...ips].flatMap((ip) => [authKey('fail-ip', ip), authKey('send-ip', ip)]),
    );
    keys.push(...[...tickets].map((ticket) => authKey('google-ticket', ticket)));
    if (keys.length) await app.get(ValkeyClient).connection.del(...keys);
    await admin.pool.query('delete from account_security_events where user_id = any($1::uuid[])', [
      ids,
    ]);
    if (ids.length) await admin.db.delete(users).where(inArray(users.id, ids));
    await admin.pool.end();
    await app.close();
    vi.restoreAllMocks();
  });
  const token = (subject: string, email: string, claims = {}) =>
    `fake-google:${JSON.stringify({ sub: subject, email, email_verified: true, hd: 'example.test', ...claims })}`;
  const google = (idToken: string, termsVersion: string | null = '2026-11') =>
    post('/auth/google', { idToken, termsVersion: termsVersion ?? undefined });
  async function createdBy(subject: string) {
    const [created] = await admin.db.select().from(users).where(eq(users.googleSubject, subject));
    if (created) ids.push(created.id);
    return created;
  }
  it('looks up an existing subject before a different verified email owner', async () => {
    const first = await account();
    const second = await account();
    const subject = randomUUID();
    await admin.db.update(users).set({ googleSubject: subject }).where(eq(users.id, first.id));
    const response = await google(token(subject, second.email!));
    expect(response.statusCode).toBe(204);
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, first.id)),
    ).toHaveLength(2);
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, second.id)),
    ).toHaveLength(1);
  });
  it('links only the verified owner despite duplicate unverified emails and records safe history', async () => {
    const typed = await account(false);
    const owner = await account();
    await admin.db.update(users).set({ email: typed.email }).where(eq(users.id, owner.id));
    const subject = randomUUID();
    expect((await google(token(subject, typed.email!.toUpperCase()))).statusCode).toBe(204);
    const [linked] = await admin.db.select().from(users).where(eq(users.id, owner.id));
    expect(linked!.googleSubject).toBe(subject);
    expect(
      (await admin.db.select().from(users).where(eq(users.id, typed.id)))[0]!.googleSubject,
    ).toBeNull();
    const audit = await admin.pool.query(
      'select event, details from account_security_events where user_id=$1',
      [owner.id],
    );
    expect(audit.rows).toEqual([{ event: 'google.linked', details: {} }]);
  });
  it('creates a new account from Google alone: no mobile proof, password or ticket', async () => {
    const email = address();
    const subject = randomUUID();
    const response = await google(token(subject, email, { name: 'রিনা আক্তার' }));
    expect(response.statusCode).toBe(204);
    expect(response.headers['set-cookie']).toBeDefined();
    const created = await createdBy(subject);
    expect(created).toMatchObject({
      name: 'রিনা আক্তার',
      email,
      emailVerifiedAt: expect.any(Date),
      phone: null,
      phoneVerifiedAt: null,
      passwordHash: null,
      termsVersion: '2026-11',
      termsAcceptedAt: expect.any(Date),
    });
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, created!.id)),
    ).toHaveLength(1);
  });
  it('names a new account from the email when Google gives no name', async () => {
    const subject = randomUUID();
    const email = address();
    expect((await google(token(subject, email))).statusCode).toBe(204);
    expect((await createdBy(subject))!.name).toBe(email.split('@')[0]);
  });
  it('refuses a new Google account without agreement to the Terms, and creates nothing', async () => {
    const subject = randomUUID();
    const response = await google(token(subject, address()), null);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('AUTH_TERMS_REQUIRED');
    expect(await createdBy(subject)).toBeUndefined();
  });
  it('signs an existing Google account in without a terms version', async () => {
    const subject = randomUUID();
    const email = address();
    expect((await google(token(subject, email))).statusCode).toBe(204);
    const created = await createdBy(subject);
    expect((await google(token(subject, email), null)).statusCode).toBe(204);
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, created!.id)),
    ).toHaveLength(2);
  });
  it('creates one account when the same Google token signs up twice at once', async () => {
    const subject = randomUUID();
    const idToken = token(subject, address());
    const results = await Promise.all([google(idToken), google(idToken)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 409]);
    const created = await admin.db.select().from(users).where(eq(users.googleSubject, subject));
    ids.push(...created.map((user) => user.id));
    expect(created).toHaveLength(1);
  });
  it('never adopts an unverified row', async () => {
    const typed = await account(false);
    const subject = randomUUID();
    expect((await google(token(subject, typed.email!))).statusCode).toBe(204);
    expect(
      (await admin.db.select().from(users).where(eq(users.id, typed.id)))[0]!.googleSubject,
    ).toBeNull();
    expect((await createdBy(subject))!.id).not.toBe(typed.id);
  });
  it('refuses an unverified Google email and sanitizes token errors', async () => {
    const owner = await account();
    const response = await google(
      token('private-subject', owner.email!, { email_verified: false }),
    );
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(owner.email!);
    expect(response.body).not.toContain('private');
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBeNull();
  });
  it('does not replace an existing Google link by matching email', async () => {
    const owner = await account();
    const existing = randomUUID();
    await admin.db.update(users).set({ googleSubject: existing }).where(eq(users.id, owner.id));
    expect((await google(token(randomUUID(), owner.email!))).statusCode).toBe(409);
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBe(existing);
  });
  it.each(['disabled', 'totp'])('preserves the common %s gate and does not link', async (state) => {
    const owner = await account();
    await admin.db
      .update(users)
      .set(state === 'disabled' ? { isDisabled: true } : { totpEnabledAt: new Date() })
      .where(eq(users.id, owner.id));
    const response = await google(token(randomUUID(), owner.email!));
    if (state === 'disabled') expect(response.json().error.code).toBe('AUTH_DISABLED');
    else {
      expect(response.statusCode).toBe(202);
      expect(response.json().status).toBe('totp_required');
    }
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBeNull();
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, owner.id)),
    ).toHaveLength(1);
  });
  it('rechecks email ownership under the completion lock', async () => {
    const owner = await account();
    const repository = app.get(UsersRepository);
    const lock = repository.lockForSignIn.bind(repository);
    vi.spyOn(repository, 'lockForSignIn').mockImplementationOnce(async (id) => {
      await admin.db.update(users).set({ email: address() }).where(eq(users.id, id));
      return lock(id);
    });
    expect((await google(token(randomUUID(), owner.email!))).statusCode).toBe(401);
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBeNull();
  });
  it('requires fresh third-party email proof before linking, then consumes the challenge once', async () => {
    const owner = await account();
    const subject = randomUUID();
    const response = await google(token(subject, owner.email!, { hd: undefined }));
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('email_verification_required');
    const verificationTicket = response.json().verificationTicket;
    tickets.add(verificationTicket);
    targets.add(
      JSON.stringify([owner.email, JSON.stringify([verificationTicket, subject, owner.email])]),
    );
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBeNull();
    const payload = { verificationTicket, code: codeFor(owner.email!) };
    const results = await Promise.all([
      post('/auth/google/email/verify', payload),
      post('/auth/google/email/verify', payload),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 400]);
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBe(subject);
  });
  async function thirdParty(email: string, subject = randomUUID()) {
    const response = await google(token(subject, email, { hd: undefined }));
    expect(response.statusCode).toBe(202);
    const verificationTicket = response.json().verificationTicket;
    tickets.add(verificationTicket);
    targets.add(JSON.stringify([email, JSON.stringify([verificationTicket, subject, email])]));
    return { verificationTicket, code: codeFor(email), subject };
  }
  it('does not reserve a third-party email until fresh email proof', async () => {
    const email = address();
    const challenge = await thirdParty(email);
    expect(await admin.db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    const response = await post('/auth/google/email/verify', {
      verificationTicket: challenge.verificationTicket,
      code: challenge.code,
    });
    expect(response.statusCode).toBe(204);
    expect(await createdBy(challenge.subject)).toMatchObject({
      email,
      emailVerifiedAt: expect.any(Date),
      phone: null,
    });
  });
  it.each(['owner_changed', 'owner_appeared', 'subject_linked', 'verification_replaced'])(
    'rejects stale third-party challenge binding: %s',
    async (change) => {
      const owner = await account();
      const email = change === 'owner_appeared' ? address() : owner.email!;
      const challenge = await thirdParty(email);
      const other = await account();
      if (change === 'owner_changed') {
        await admin.db.update(users).set({ email: address() }).where(eq(users.id, owner.id));
        await admin.db.update(users).set({ email }).where(eq(users.id, other.id));
      }
      if (change === 'owner_appeared')
        await admin.db.update(users).set({ email }).where(eq(users.id, other.id));
      if (change === 'subject_linked')
        await admin.db
          .update(users)
          .set({ googleSubject: challenge.subject })
          .where(eq(users.id, other.id));
      if (change === 'verification_replaced')
        await admin.db
          .update(users)
          .set({ emailVerifiedAt: new Date(Date.now() + 1000) })
          .where(eq(users.id, owner.id));
      const response = await post('/auth/google/email/verify', {
        verificationTicket: challenge.verificationTicket,
        code: challenge.code,
      });
      expect(response.json().error.code).toBe('AUTH_GOOGLE_TICKET_INVALID');
      expect(
        await admin.db.select().from(sessions).where(eq(sessions.userId, owner.id)),
      ).toHaveLength(1);
    },
  );
  it('binds email proof to the exact pending subject and ticket', async () => {
    const email = address();
    const first = await thirdParty(email);
    await app.get(ValkeyClient).connection.del(authKey('resend', email));
    const second = await thirdParty(email);
    const response = await post('/auth/google/email/verify', {
      verificationTicket: second.verificationTicket,
      code: first.code,
    });
    expect(response.statusCode).toBe(400);
    const verified = await post('/auth/google/email/verify', {
      verificationTicket: first.verificationTicket,
      code: first.code,
    });
    expect(verified.statusCode).toBe(204);
    await createdBy(first.subject);
  });
  it('refuses a subject linked elsewhere between lookup and the locked write', async () => {
    const owner = await account();
    const other = await account();
    const subject = randomUUID();
    const repository = app.get(UsersRepository);
    const lock = repository.lockForSignIn.bind(repository);
    vi.spyOn(repository, 'lockForSignIn').mockImplementationOnce(async (id) => {
      await admin.db.update(users).set({ googleSubject: subject }).where(eq(users.id, other.id));
      return lock(id);
    });
    expect((await google(token(subject, owner.email!))).json().error.code).toBe(
      'AUTH_GOOGLE_CONFLICT',
    );
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBeNull();
  });
  it('rolls back Google linking and its session when account history fails', async () => {
    const owner = await account();
    vi.spyOn(app.get(AccountSecurityEventsService), 'record').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    expect((await google(token(randomUUID(), owner.email!))).statusCode).toBe(500);
    expect(
      (await admin.db.select().from(users).where(eq(users.id, owner.id)))[0]!.googleSubject,
    ).toBeNull();
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, owner.id)),
    ).toHaveLength(1);
  });
  it('rolls back a new Google account and its session when account history fails', async () => {
    const subject = randomUUID();
    vi.spyOn(app.get(AccountSecurityEventsService), 'record').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    expect((await google(token(subject, address()))).statusCode).toBe(500);
    expect(await createdBy(subject)).toBeUndefined();
  });
  it('honors shared account locks and only resets failures after full Google sign-in', async () => {
    const owner = await account();
    const redis = app.get(ValkeyClient).connection;
    await redis.set(authKey('fail-user', owner.id), '5', 'EX', 60);
    expect((await google(token(randomUUID(), owner.email!))).json().error.code).toBe('AUTH_LOCKED');
    await redis.set(authKey('fail-user', owner.id), '4', 'EX', 60);
    await admin.db.update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, owner.id));
    expect((await google(token(randomUUID(), owner.email!))).json().status).toBe('totp_required');
    expect(await redis.get(authKey('fail-user', owner.id))).toBe('4');
    await admin.db.update(users).set({ totpEnabledAt: null }).where(eq(users.id, owner.id));
    expect((await google(token(randomUUID(), owner.email!))).statusCode).toBe(204);
    expect(await redis.get(authKey('fail-user', owner.id))).toBeNull();
  });
  it('does not let malformed tokens from unrelated IPs lock every Google user', async () => {
    for (let attempt = 0; attempt < 5; attempt++) await google('invalid-token');
    const owner = await account();
    expect((await google(token(randomUUID(), owner.email!))).statusCode).toBe(204);
  });

  it('rejects a subject changed after its initial lookup', async () => {
    const owner = await account();
    const subject = randomUUID();
    await admin.db.update(users).set({ googleSubject: subject }).where(eq(users.id, owner.id));
    const repository = app.get(UsersRepository);
    const lock = repository.lockForSignIn.bind(repository);
    vi.spyOn(repository, 'lockForSignIn').mockImplementationOnce(async (id) => {
      await admin.db.update(users).set({ googleSubject: randomUUID() }).where(eq(users.id, id));
      return lock(id);
    });
    expect((await google(token(subject, owner.email!))).json().error.code).toBe(
      'AUTH_INVALID_CREDENTIALS',
    );
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, owner.id)),
    ).toHaveLength(1);
  });

  it('rechecks the third-party verification timestamp under the completion lock', async () => {
    const owner = await account();
    const challenge = await thirdParty(owner.email!);
    const repository = app.get(UsersRepository);
    const lock = repository.lockForSignIn.bind(repository);
    vi.spyOn(repository, 'lockForSignIn').mockImplementationOnce(async (id) => {
      await admin.db
        .update(users)
        .set({ emailVerifiedAt: new Date(Date.now() + 1000) })
        .where(eq(users.id, id));
      return lock(id);
    });
    const response = await post('/auth/google/email/verify', {
      verificationTicket: challenge.verificationTicket,
      code: challenge.code,
    });
    expect(response.json().error.code).toBe('AUTH_GOOGLE_TICKET_INVALID');
  });

  it.each(['typed', 'unexpected'])(
    'does not count %s provider outages against account, token or IP failure counters',
    async (kind) => {
      const owner = await account();
      const idToken = token(randomUUID(), owner.email!);
      const ip = `2001:db8::${randomInt(1, 65535).toString(16)}`;
      ips.add(ip);
      const target = authKey('google-token', idToken);
      targets.add(target);
      const redis = app.get(ValkeyClient).connection;
      const keys = [
        authKey('fail-user', owner.id),
        authKey('fail-target', target),
        authKey('fail-ip', ip),
      ];
      await redis.mset(keys[0]!, '2', keys[1]!, '3', keys[2]!, '4');
      const failure =
        kind === 'typed'
          ? new GoogleIdentityError('GOOGLE_IDENTITY_UNAVAILABLE')
          : new Error('private-provider-error');
      const outage = vi
        .spyOn(FakeGoogleIdentityDriver.prototype, 'verify')
        .mockRejectedValue(failure);
      try {
        for (let attempt = 0; attempt < 35; attempt++) {
          const value = attempt < 6 ? idToken : token(randomUUID(), owner.email!);
          const fingerprint = authKey('google-token', value);
          targets.add(fingerprint);
          const response = await app.inject({
            method: 'POST',
            url: '/auth/google',
            remoteAddress: ip,
            payload: { idToken: value },
            headers: { origin: 'http://localhost:3000' },
          });
          expect(response.statusCode).toBe(503);
          expect(response.json().error.code).toBe('AUTH_GOOGLE_UNAVAILABLE');
          expect(response.body).not.toContain('private-');
          if (attempt >= 6) expect(await redis.get(authKey('fail-target', fingerprint))).toBeNull();
        }
      } finally {
        outage.mockRestore();
      }
      expect(await redis.mget(...keys)).toEqual(['2', '3', '4']);
      expect(
        await admin.db.select().from(sessions).where(eq(sessions.userId, owner.id)),
      ).toHaveLength(1);
    },
  );

  it('refuses a third-party challenge if another flow links its subject to the same owner before the lock', async () => {
    const owner = await account();
    const challenge = await thirdParty(owner.email!);
    const repository = app.get(UsersRepository);
    const lock = repository.lockForSignIn.bind(repository);
    vi.spyOn(repository, 'lockForSignIn').mockImplementationOnce(async (id) => {
      await admin.db
        .update(users)
        .set({ googleSubject: challenge.subject })
        .where(eq(users.id, id));
      return lock(id);
    });
    const response = await post('/auth/google/email/verify', {
      verificationTicket: challenge.verificationTicket,
      code: challenge.code,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('AUTH_GOOGLE_TICKET_INVALID');
    expect(
      await admin.db.select().from(sessions).where(eq(sessions.userId, owner.id)),
    ).toHaveLength(1);
  });

  it('keeps distinct invalid tokens below the shared IP limit from blocking a valid account', async () => {
    const ip = `2001:db8::${randomInt(1, 65535).toString(16)}`;
    ips.add(ip);
    const fromIp = (idToken: string) => {
      targets.add(authKey('google-token', idToken));
      return app.inject({
        method: 'POST',
        url: '/auth/google',
        payload: { idToken },
        remoteAddress: ip,
        headers: { origin: 'http://localhost:3000' },
      });
    };
    for (let attempt = 0; attempt < 6; attempt++)
      expect((await fromIp(`invalid-${randomUUID()}`)).statusCode).toBe(401);
    const owner = await account();
    expect((await fromIp(token(randomUUID(), owner.email!))).statusCode).toBe(204);
    expect(await app.get(ValkeyClient).connection.get(authKey('fail-ip', ip))).toBe('6');
    await app.get(ValkeyClient).connection.set(authKey('fail-ip', ip), '30', 'EX', 60);
    expect((await fromIp(token(randomUUID(), owner.email!))).json().error.code).toBe(
      'AUTH_RATE_LIMITED',
    );
  });
});
