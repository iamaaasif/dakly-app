import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { SmsService } from '../sms/sms.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures, type SignInSubject } from './sign-in-failures';
import { EmailService } from '../email/email.service';
import { authKey } from './auth-key';

const sms = new FakeSmsDriver();
const client = new ValkeyClient(process.env.REDIS_URL!);
const email = { send: async () => undefined } as unknown as EmailService;
const smsService = new SmsService(sms);
const failures = new SignInFailures(client, smsService, email);
const codes = new SignInCodes(client, new RateLimiter(client), failures, smsService, email);
const owned = new Set<string>();
function fixture(userId?: string, ip = randomUUID()) {
  const target = randomUUID();
  const subject: SignInSubject = { target, userId, phone: target };
  for (const purpose of ['sign_up', 'sign_in', 'reset_password', 'add_email'])
    owned.add(authKey(`code:${purpose}`, target));
  for (const kind of ['resend', 'send-target', 'fail-target']) owned.add(authKey(kind, target));
  for (const kind of ['send-ip', 'fail-ip']) owned.add(authKey(kind, ip));
  if (userId) owned.add(authKey('fail-user', userId));
  return { subject, ip, codeKey: authKey('code:sign_in', target) };
}
const codeFor = (target: string) =>
  sms.messages.findLast((message) => message.to === target)!.text.match(/\b\d{6}\b/)![0];
const wrongCode = (code: string) => (code === '000000' ? '999999' : '000000');

describe('Sign-in codes and failures in Valkey', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
    return client.onModuleInit();
  });
  afterAll(async () => {
    for (const message of sms.messages) {
      const code = message.text.match(/\b\d{6}\b/)?.[0];
      if (code)
        for (const purpose of ['sign_up', 'sign_in', 'reset_password', 'add_email'])
          owned.add(authKey('consumed', JSON.stringify([message.to, purpose, code])));
    }
    await client.connection.del(...owned);
    client.onApplicationShutdown();
  });

  it('stores a hash for ten minutes and rejects an expired code', async () => {
    const { subject, ip, codeKey } = fixture();
    await codes.send(subject, 'sign_in', ip);
    const code = codeFor(subject.target);
    expect(code).toMatch(/^\d{6}$/);
    const stored = await client.connection.hgetall(codeKey);
    expect(stored.hash).toMatch(/^auth:code-hash:[a-f0-9]{64}$/);
    expect(Object.values(stored)).not.toContain(code);
    expect(await client.connection.ttl(codeKey)).toBeGreaterThanOrEqual(599);
    expect(await client.connection.ttl(codeKey)).toBeLessThanOrEqual(600);
    await client.connection.pexpire(codeKey, 1);
    await setTimeout(10);
    await expect(codes.consume(subject, 'sign_in', code, ip)).rejects.toMatchObject({
      code: 'AUTH_CODE_INVALID',
    });
  });

  it('binds the code to its target and purpose and consumes it only once under concurrency', async () => {
    const { subject, ip } = fixture();
    const other = fixture();
    await codes.send(subject, 'sign_in', ip);
    const code = codeFor(subject.target);
    await expect(codes.consume(other.subject, 'sign_in', code, other.ip)).rejects.toMatchObject({
      code: 'AUTH_CODE_INVALID',
    });
    await expect(codes.consume(subject, 'reset_password', code, ip)).rejects.toMatchObject({
      code: 'AUTH_CODE_INVALID',
    });
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => codes.consume(subject, 'sign_in', code, ip)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('deletes a challenge after five wrong tries even if shared failure state is reset', async () => {
    const { subject, ip, codeKey } = fixture();
    await codes.send(subject, 'sign_in', ip);
    const code = codeFor(subject.target);
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(codes.consume(subject, 'sign_in', wrongCode(code), ip)).rejects.toMatchObject({
        code: 'AUTH_CODE_INVALID',
      });
      await failures.reset(subject);
    }
    expect(await client.connection.exists(codeKey)).toBe(0);
    await expect(codes.consume(subject, 'sign_in', code, ip)).rejects.toMatchObject({
      code: 'AUTH_CODE_INVALID',
    });
  });

  it('enforces the thirty-second cooldown and five sends per target across purposes and IPs', async () => {
    const { subject, ip } = fixture();
    await codes.send(subject, 'sign_in', ip);
    await expect(codes.send(subject, 'sign_up', ip)).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    });
    expect(await client.connection.ttl(authKey('resend', subject.target))).toBeGreaterThanOrEqual(
      29,
    );
    await client.connection.pexpire(authKey('resend', subject.target), 1);
    await setTimeout(10);
    for (let sent = 1; sent < 5; sent++) {
      await codes.send(subject, 'sign_in', ip);
      await client.connection.del(authKey('resend', subject.target));
    }
    const differentIp = fixture().ip;
    await expect(codes.send(subject, 'sign_up', differentIp)).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    });
  });

  it('allows only twenty SMS sends per IP per hour across different targets', async () => {
    const ip = randomUUID();
    for (let sent = 0; sent < 20; sent++)
      await codes.send(fixture(undefined, ip).subject, 'sign_in', ip);
    await expect(codes.send(fixture(undefined, ip).subject, 'sign_in', ip)).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    });
    expect(await client.connection.ttl(authKey('send-ip', ip))).toBeGreaterThanOrEqual(3599);
  });

  it('shares failures between phone and email and sends one notification on the lock transition', async () => {
    const userId = randomUUID();
    const phone = fixture(userId);
    const email = fixture(userId);
    for (let attempt = 0; attempt < 4; attempt++)
      await failures.recordFailure(phone.subject, phone.ip);
    const before = sms.messages.length;
    await expect(failures.recordFailure(email.subject, email.ip)).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
    await expect(failures.assertAllowed(phone.subject, phone.ip)).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
    await expect(failures.recordFailure(phone.subject, phone.ip)).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
    expect(sms.messages.slice(before)).toHaveLength(1);
    expect(sms.messages[before]!.text).toContain('15 minutes');
    expect(await client.connection.ttl(authKey('fail-user', userId))).toBeGreaterThanOrEqual(899);
    await client.connection.pexpire(authKey('fail-user', userId), 1);
    await setTimeout(10);
    await expect(failures.assertAllowed(phone.subject, phone.ip)).resolves.toBeUndefined();
  });

  it('retains account failures when a code is resent', async () => {
    const { subject, ip } = fixture(randomUUID());
    await codes.send(subject, 'sign_in', ip);
    for (let attempt = 0; attempt < 4; attempt++) await failures.recordFailure(subject, ip);
    await client.connection.del(authKey('resend', subject.target));
    await codes.send(subject, 'sign_in', ip);
    await expect(failures.recordFailure(subject, ip)).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
  });

  it('limits unknown identities by target and hourly IP failures without clearing IP history on success', async () => {
    const ip = randomUUID();
    for (let count = 0; count < 29; count++)
      await failures.recordFailure(fixture(undefined, ip).subject, ip);
    const { subject } = fixture(undefined, ip);
    await expect(failures.recordFailure(subject, ip)).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    });
    await failures.reset(subject);
    await expect(failures.assertAllowed(fixture(undefined, ip).subject, ip)).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    });
    expect(await client.connection.ttl(authKey('fail-ip', ip))).toBeGreaterThanOrEqual(3599);
  });

  it('keeps the lock when its notification fails', async () => {
    const { subject, ip } = fixture(randomUUID());
    for (let attempt = 0; attempt < 4; attempt++) await failures.recordFailure(subject, ip);
    const send = vi.spyOn(sms, 'send').mockRejectedValueOnce(new Error('vendor rejected'));
    await expect(failures.recordFailure(subject, ip)).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
    send.mockRestore();
    await expect(failures.assertAllowed(subject, ip)).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
  });

  it('retains the saved code and cooldown after uncertain SMS delivery', async () => {
    const { subject, ip, codeKey } = fixture();
    const send = vi.spyOn(sms, 'send').mockRejectedValueOnce(new Error('vendor timeout'));
    await expect(codes.send(subject, 'sign_in', ip)).rejects.toMatchObject({
      code: 'AUTH_SMS_UNAVAILABLE',
    });
    send.mockRestore();
    expect(await client.connection.exists(codeKey)).toBe(1);
    await expect(codes.send(subject, 'sign_in', ip)).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    });
  });
  it('expires unknown-target failure history instead of retaining unbounded identities', async () => {
    const { subject, ip } = fixture();
    await failures.recordFailure(subject, ip);
    expect(await client.connection.ttl(authKey('fail-target', subject.target))).toBeGreaterThan(0);
    expect(await client.connection.ttl(authKey('fail-target', subject.target))).toBeLessThanOrEqual(
      3600,
    );
  });
  it('rejects a consumed-code replay without counting it as a wrong code or extending its marker', async () => {
    const { subject, ip, codeKey } = fixture(randomUUID());
    await codes.send(subject, 'sign_in', ip);
    const code = codeFor(subject.target);
    for (let attempt = 0; attempt < 4; attempt++) await failures.recordFailure(subject, ip);
    await client.connection.pexpire(codeKey, 30000);
    await codes.consume(subject, 'sign_in', code, ip);
    await expect(codes.consume(subject, 'sign_in', code, ip)).rejects.toMatchObject({
      code: 'AUTH_CODE_INVALID',
    });
    const marker = authKey('consumed', JSON.stringify([subject.target, 'sign_in', code]));
    owned.add(marker);
    expect(await client.connection.pttl(marker)).toBeGreaterThan(0);
    expect(await client.connection.pttl(marker)).toBeLessThanOrEqual(30000);
    await client.connection.pexpire(marker, 15000);
    await expect(codes.consume(subject, 'sign_in', code, ip)).rejects.toMatchObject({
      code: 'AUTH_CODE_INVALID',
    });
    expect(await client.connection.pttl(marker)).toBeLessThanOrEqual(15000);
    expect(await client.connection.exists(codeKey)).toBe(0);
    await expect(codes.consume(subject, 'sign_in', wrongCode(code), ip)).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
  });
});
