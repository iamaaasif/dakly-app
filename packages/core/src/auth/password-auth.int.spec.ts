import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { PasswordCredentials } from './password-credentials';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDatabase } from '@dakly/db/client';
import { users } from '@dakly/db/schema/auth';
import { stores } from '@dakly/db/schema/stores';
import { memberships } from '@dakly/db/schema/team';
import { AnyMember } from '../platform/tenancy/access.decorators';
import { SmtpEmailDriver } from '@dakly/providers/email/smtp/smtp-email-driver';
import type { EmailMessage } from '@dakly/providers/email/email-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { AuthModule } from './auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsService } from '../sessions/sessions.service';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { authKey } from './auth-key';

class StoreController {
  read() {
    return { accessible: true };
  }
}
Controller('password-test-store')(StoreController);
AnyMember()(StoreController);
Get()(
  StoreController.prototype,
  'read',
  Object.getOwnPropertyDescriptor(StoreController.prototype, 'read')!,
);
class PasswordTestModule {}
Module({ imports: [DatabaseModule, AuthModule], controllers: [StoreController] })(
  PasswordTestModule,
);

describe('Password authentication over Fastify', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const sms = new FakeSmsDriver();
  const messages: EmailMessage[] = [];
  const ids: string[] = [];
  const storeIds: string[] = [];
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
    targets.add(JSON.stringify([phone, user!.id]));
    const session = await app
      .get(SessionsService)
      .create(user!.id, { ip: '192.0.2.1', isRemembered: false });
    return { ...user!, cookie: `dakly_session=${session.token}` };
  }
  async function passwordAccount() {
    const user = await account();
    await post('/auth/password-reset', { identifier: user.phone });
    const reset = await post('/auth/password-reset/confirm', {
      identifier: user.phone,
      code: codeFor(user.email!),
      password: 'originalpass1',
    });
    expect(reset.statusCode).toBe(204);
    await app.get(ValkeyClient).connection.del(authKey('resend', user.phone!));
    return { ...user, cookie: String(reset.headers['set-cookie']).split(';')[0]! };
  }
  beforeAll(async () => {
    vi.spyOn(SmtpEmailDriver.prototype, 'send').mockImplementation(async (message) => {
      messages.push(message);
    });
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) => sms.send(message));
    app = await NestFactory.create<NestFastifyApplication>(
      PasswordTestModule,
      new FastifyAdapter(),
      {
        logger: false,
      },
    );
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
        'code:reset_password',
        'code:password_change_proof',
        'code:add_email',
        'code:email_change_proof',
      ].map((kind) => authKey(kind, target)),
    );
    for (const message of [...sms.messages, ...messages]) {
      const code = message.text.match(/\b\d{6}\b/)?.[0];
      if (!code) continue;
      for (const target of targets)
        keys.push(
          ...[
            'sign_in',
            'add_email',
            'email_change_proof',
            'reset_password',
            'password_change_proof',
          ].map((purpose) => authKey('consumed', JSON.stringify([target, purpose, code]))),
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
    if (storeIds.length)
      await admin.db.delete(memberships).where(inArray(memberships.storeId, storeIds));
    if (ids.length) await admin.db.delete(users).where(inArray(users.id, ids));
    if (storeIds.length) await admin.db.delete(stores).where(inArray(stores.id, storeIds));
    await admin.pool.end();
    await app.close();
    vi.restoreAllMocks();
  });
  it('uses one 401 error for unknown and wrong credentials', async () => {
    const user = await account();
    const wrong = await post('/auth/password', { identifier: user.phone, password: 'wrongpass1' });
    const unknown = await post('/auth/password', { identifier: address(), password: 'wrongpass1' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });
  it('resets with a purpose-bound code, revokes existing sessions and signs in with the new password', async () => {
    const user = await account();
    expect((await post('/auth/password-reset', { identifier: user.phone })).statusCode).toBe(204);
    const result = await post('/auth/password-reset/confirm', {
      identifier: user.phone,
      code: codeFor(user.email!),
      password: 'newpassword1',
    });
    expect(result.statusCode).toBe(204);
    expect(result.headers['set-cookie']).toContain('HttpOnly');
    expect((await post('/me/email/proof', { email: address() }, user.cookie)).statusCode).toBe(401);
    expect(
      (
        await post('/auth/password', {
          identifier: user.email!.toUpperCase(),
          password: 'newpassword1',
        })
      ).statusCode,
    ).toBe(204);
    const events = await admin.pool.query(
      'select event from account_security_events where user_id=$1 order by event',
      [user.id],
    );
    expect(events.rows).toEqual([{ event: 'password.changed' }, { event: 'sessions.revoked' }]);
  });
  it('rejects sign-in codes as reset codes', async () => {
    const user = await account();
    await post('/auth/code', { purpose: 'sign_in', phone: user.phone });
    const response = await post('/auth/password-reset/confirm', {
      identifier: user.phone,
      code: codeFor(user.email!),
      password: 'newpassword1',
    });
    expect(response.json().error.code).toBe('AUTH_CODE_INVALID');
  });
  it('refuses repeated unverified emails without choosing an arbitrary account', async () => {
    const one = await account(false);
    const two = await account(false);
    await admin.db.update(users).set({ email: one.email }).where(eq(users.id, two.id));
    const response = await post('/auth/password', {
      identifier: one.email,
      password: 'newpassword1',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('AUTH_EMAIL_UNVERIFIED');
  });
  it('shares password and code lockouts across phone and email', async () => {
    const user = await passwordAccount();
    for (let i = 0; i < 4; i++)
      expect(
        (
          await post('/auth/password', {
            identifier: i % 2 ? user.email : user.phone,
            password: 'incorrect1',
          })
        ).statusCode,
      ).toBe(401);
    const response = await post('/auth/code/verify', {
      purpose: 'sign_in',
      phone: user.phone,
      code: '000000',
    });
    expect(response.json().error.code).toBe('AUTH_LOCKED');
    expect(
      (await post('/auth/password', { identifier: user.phone, password: 'originalpass1' })).json()
        .error.code,
    ).toBe('AUTH_LOCKED');
  });
  it.each(['disabled', 'totp'])(
    'preserves the common completion gate for password and reset: %s',
    async (state) => {
      const user = await passwordAccount();
      await post('/auth/password-reset', { identifier: user.phone });
      await admin.db
        .update(users)
        .set(state === 'disabled' ? { isDisabled: true } : { totpEnabledAt: new Date() })
        .where(eq(users.id, user.id));
      await app.get(ValkeyClient).connection.set(authKey('fail-user', user.id), '3');
      const response = await post('/auth/password', {
        identifier: user.phone,
        password: 'originalpass1',
      });
      if (state === 'disabled') expect(response.json().error.code).toBe('AUTH_DISABLED');
      else expect(response.json().status).toBe('totp_required');
      const reset = await post('/auth/password-reset/confirm', {
        identifier: user.phone,
        code: codeFor(user.email!),
        password: 'newpassword1',
      });
      if (state === 'disabled') expect(reset.json().error.code).toBe('AUTH_DISABLED');
      else expect(reset.json().status).toBe('totp_required');
      expect(reset.headers['set-cookie']).toBeUndefined();
      expect(await app.get(ValkeyClient).connection.get(authKey('fail-user', user.id))).toBe('3');
      if (state === 'totp')
        expect((await post('/me/email/proof', { email: address() }, user.cookie)).statusCode).toBe(
          401,
        );
    },
  );
  it('rolls back password and all session revocations when audit fails', async () => {
    const user = await passwordAccount();
    await post('/auth/password-reset', { identifier: user.phone });
    vi.spyOn(app.get(AccountSecurityEventsService), 'record').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    const response = await post('/auth/password-reset/confirm', {
      identifier: user.phone,
      code: codeFor(user.email!),
      password: 'newpassword1',
    });
    expect(response.statusCode).toBe(500);
    expect(await app.get(SessionsService).resolve(user.cookie.split('=')[1]!)).toBeDefined();
    expect(
      (await post('/auth/password', { identifier: user.phone, password: 'originalpass1' }))
        .statusCode,
    ).toBe(204);
  });
  it('sets a first password using a separate fresh code and changes it with current password', async () => {
    const user = await account();
    expect((await post('/me/password/proof', {}, user.cookie)).statusCode).toBe(204);
    expect(
      (
        await post(
          '/me/password',
          { password: 'originalpass1', proofCode: codeFor(user.email!) },
          user.cookie,
        )
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await post(
          '/me/password',
          { password: 'newpassword1', currentPassword: 'originalpass1' },
          user.cookie,
        )
      ).statusCode,
    ).toBe(204);
    expect(
      (await post('/auth/password', { identifier: user.phone, password: 'originalpass1' }))
        .statusCode,
    ).toBe(401);
    expect(
      (await post('/auth/password', { identifier: user.phone, password: 'newpassword1' }))
        .statusCode,
    ).toBe(204);
  });
  it('uses password proof in the existing email-change flow and rejects it after password change', async () => {
    const user = await passwordAccount();
    const email = address();
    targets.add(JSON.stringify([email, user.id]));
    expect(
      (await post('/me/email', { email, currentPassword: 'originalpass1' }, user.cookie))
        .statusCode,
    ).toBe(204);
    await post(
      '/me/password',
      { password: 'newpassword1', currentPassword: 'originalpass1' },
      user.cookie,
    );
    expect(
      (await post('/me/email/verify', { email, code: codeFor(email) }, user.cookie)).json().error
        .code,
    ).toBe('AUTH_PROOF_REQUIRED');
  });
  it.each(['change', 'reset', 'recovery'])(
    'rejects an in-flight old password after committed %s',
    async (action) => {
      const user = await passwordAccount();
      const credentials = app.get(PasswordCredentials);
      const check = credentials.check.bind(credentials);
      let release!: () => void;
      let checked!: () => void;
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reached = new Promise<void>((resolve) => {
        checked = resolve;
      });
      vi.spyOn(credentials, 'check').mockImplementationOnce(async (...args) => {
        const proof = await check(...args);
        checked();
        await paused;
        return proof;
      });
      const pending = post('/auth/password', { identifier: user.phone, password: 'originalpass1' });
      await reached;
      try {
        if (action === 'change') {
          expect(
            (
              await post(
                '/me/password',
                { password: 'newpassword1', currentPassword: 'originalpass1' },
                user.cookie,
              )
            ).statusCode,
          ).toBe(204);
        } else if (action === 'reset') {
          await post('/auth/password-reset', { identifier: user.phone });
          expect(
            (
              await post('/auth/password-reset/confirm', {
                identifier: user.phone,
                code: codeFor(user.email!),
                password: 'newpassword1',
              })
            ).statusCode,
          ).toBe(204);
        } else {
          await admin.db
            .update(users)
            .set({ passwordHash: await hash('recoveredpass1') })
            .where(eq(users.id, user.id));
        }
      } finally {
        release();
      }
      const response = await pending;
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );
  it('rejects a stale current-password proof before a concurrent change can overwrite the new password', async () => {
    const user = await passwordAccount();
    const credentials = app.get(PasswordCredentials);
    const check = credentials.check.bind(credentials);
    let release!: () => void;
    let checked!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      checked = resolve;
    });
    vi.spyOn(credentials, 'check').mockImplementationOnce(async (...args) => {
      const proof = await check(...args);
      checked();
      await paused;
      return proof;
    });
    const pending = post(
      '/me/password',
      { password: 'stalepassword1', currentPassword: 'originalpass1' },
      user.cookie,
    );
    await reached;
    try {
      expect(
        (
          await post(
            '/me/password',
            { password: 'newpassword1', currentPassword: 'originalpass1' },
            user.cookie,
          )
        ).statusCode,
      ).toBe(204);
    } finally {
      release();
    }
    expect((await pending).json().error.code).toBe('AUTH_PROOF_REQUIRED');
    expect(
      (await post('/auth/password', { identifier: user.phone, password: 'newpassword1' }))
        .statusCode,
    ).toBe(204);
  });
  it('rejects a reset code issued before a password change', async () => {
    const user = await passwordAccount();
    await post('/auth/password-reset', { identifier: user.phone });
    const code = codeFor(user.email!);
    await post(
      '/me/password',
      { password: 'newpassword1', currentPassword: 'originalpass1' },
      user.cookie,
    );
    expect(
      (
        await post('/auth/password-reset/confirm', {
          identifier: user.phone,
          code,
          password: 'stalereset1',
        })
      ).json().error.code,
    ).toBe('AUTH_PROOF_REQUIRED');
    expect(await app.get(SessionsService).resolve(user.cookie.split('=')[1]!)).toBeDefined();
  });
  it('consumes reset proof once under parallel confirms', async () => {
    const user = await account();
    await post('/auth/password-reset', { identifier: user.phone });
    const payload = {
      identifier: user.phone,
      code: codeFor(user.email!),
      password: 'newpassword1',
    };
    const results = await Promise.all([
      post('/auth/password-reset/confirm', payload),
      post('/auth/password-reset/confirm', payload),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([204, 400]);
  });
  it('expires password proof after ten minutes in the email verification flow', async () => {
    const user = await passwordAccount();
    const email = address();
    targets.add(JSON.stringify([email, user.id]));
    expect(
      (await post('/me/email', { email, currentPassword: 'originalpass1' }, user.cookie))
        .statusCode,
    ).toBe(204);
    const clock = vi.spyOn(Clock.prototype, 'now').mockReturnValue(new Date(Date.now() + 600_001));
    try {
      expect(
        (await post('/me/email/verify', { email, code: codeFor(email) }, user.cookie)).json().error
          .code,
      ).toBe('AUTH_PROOF_REQUIRED');
    } finally {
      clock.mockRestore();
    }
  });
  it('selects the verified email owner despite duplicate unverified values', async () => {
    const user = await passwordAccount();
    const other = await account(false);
    await admin.db.update(users).set({ email: user.email }).where(eq(users.id, other.id));
    const result = await post('/auth/password', {
      identifier: user.email,
      password: 'originalpass1',
    });
    expect(result.statusCode).toBe(204);
    const token = String(result.headers['set-cookie']).split(';')[0]!.split('=')[1]!;
    expect((await app.get(SessionsService).resolve(token))?.userId).toBe(user.id);
  });
  it('refuses identifier reassignment between password verification and completion', async () => {
    const user = await passwordAccount();
    const credentials = app.get(PasswordCredentials);
    const check = credentials.check.bind(credentials);
    vi.spyOn(credentials, 'check').mockImplementationOnce(async (...args) => {
      const proof = await check(...args);
      const phone = `019${randomInt(10000000, 99999999)}`;
      targets.add(phone);
      await admin.db.update(users).set({ phone }).where(eq(users.id, user.id));
      return proof;
    });
    expect(
      (await post('/auth/password', { identifier: user.phone, password: 'originalpass1' })).json()
        .error.code,
    ).toBe('AUTH_INVALID_CREDENTIALS');
  });
  it('revokes every old session on later account and store requests', async () => {
    const user = await account();
    const [store] = await admin.db
      .insert(stores)
      .values({ name: 'রিনার দোকান' })
      .returning({ id: stores.id });
    storeIds.push(store!.id);
    await admin.db.insert(memberships).values({
      storeId: store!.id,
      userId: user.id,
      builtInRole: 'support_agent',
      status: 'active',
    });
    const service = app.get(SessionsService);
    const existing = await service.resolve(user.cookie.split('=')[1]!);
    await service.setActiveStore(user.id, existing!.id, store!.id);
    const second = await service.create(user.id, { isRemembered: true });
    await service.setActiveStore(user.id, second.session.id, store!.id);
    const cookies = [user.cookie, `dakly_session=${second.token}`];
    for (const cookie of cookies) {
      expect((await app.inject({ url: '/me', headers: { cookie } })).statusCode).toBe(200);
      expect(
        (await app.inject({ url: '/password-test-store', headers: { cookie } })).statusCode,
      ).toBe(200);
    }
    await post('/auth/password-reset', { identifier: user.phone });
    expect(
      (
        await post('/auth/password-reset/confirm', {
          identifier: user.phone,
          code: codeFor(user.email!),
          password: 'newpassword1',
        })
      ).statusCode,
    ).toBe(204);
    for (const cookie of cookies) {
      expect((await app.inject({ url: '/me', headers: { cookie } })).statusCode).toBe(401);
      expect(
        (await app.inject({ url: '/password-test-store', headers: { cookie } })).statusCode,
      ).toBe(401);
    }
  });
  it.each(['phone', 'email'])(
    'rejects reset proof after the %s verification identity changes',
    async (kind) => {
      const user = await account();
      await post('/auth/password-reset', { identifier: user.phone });
      const code = codeFor(user.email!);
      await admin.db
        .update(users)
        .set(
          kind === 'phone'
            ? { phoneVerifiedAt: new Date(Date.now() + 1000) }
            : { email: address() },
        )
        .where(eq(users.id, user.id));
      expect(
        (
          await post('/auth/password-reset/confirm', {
            identifier: user.phone,
            code,
            password: 'newpassword1',
          })
        ).json().error.code,
      ).toBe('AUTH_PROOF_REQUIRED');
    },
  );
  it('finishes email verification with user-bound password proof without storing the hash', async () => {
    const user = await passwordAccount();
    const email = address();
    const target = JSON.stringify([email, user.id]);
    targets.add(target);
    expect(
      (await post('/me/email', { email, currentPassword: 'originalpass1' }, user.cookie))
        .statusCode,
    ).toBe(204);
    const data = await app.get(ValkeyClient).connection.hgetall(authKey('code:add_email', target));
    expect(JSON.stringify(data)).not.toContain('originalpass1');
    expect(JSON.stringify(data)).not.toContain('$argon2');
    expect(
      (await post('/me/email/verify', { email, code: codeFor(email) }, user.cookie)).statusCode,
    ).toBe(204);
    expect(
      (await post('/auth/password', { identifier: email, password: 'originalpass1' })).statusCode,
    ).toBe(204);
  });
  it('allows an already-started session check to finish while later requests see reset revocation', async () => {
    const user = await account();
    const service = app.get(SessionsService);
    const resolve = service.resolve.bind(service);
    let resume!: () => void;
    let read!: () => void;
    const paused = new Promise<void>((done) => {
      resume = done;
    });
    const reached = new Promise<void>((done) => {
      read = done;
    });
    vi.spyOn(service, 'resolve').mockImplementationOnce(async (token) => {
      const session = await resolve(token);
      read();
      await paused;
      return session;
    });
    const pending = app.inject({ url: '/me', headers: { cookie: user.cookie } });
    await reached;
    try {
      await post('/auth/password-reset', { identifier: user.phone });
      expect(
        (
          await post('/auth/password-reset/confirm', {
            identifier: user.phone,
            code: codeFor(user.email!),
            password: 'newpassword1',
          })
        ).statusCode,
      ).toBe(204);
    } finally {
      resume();
    }
    expect((await pending).statusCode).toBe(200);
    expect((await app.inject({ url: '/me', headers: { cookie: user.cookie } })).statusCode).toBe(
      401,
    );
  });
  it('signs in and resets when a verified email is stored in mixed case', async () => {
    const user = await passwordAccount();
    await admin.db
      .update(users)
      .set({ email: user.email!.toUpperCase() })
      .where(eq(users.id, user.id));
    expect(
      (await post('/auth/password', { identifier: user.email, password: 'originalpass1' }))
        .statusCode,
    ).toBe(204);
    expect((await post('/auth/password-reset', { identifier: user.email })).statusCode).toBe(204);
    expect(
      (
        await post('/auth/password-reset/confirm', {
          identifier: user.email,
          code: codeFor(user.email!),
          password: 'newpassword1',
        })
      ).statusCode,
    ).toBe(204);
  });
});
