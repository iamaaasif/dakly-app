import 'reflect-metadata';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hash } from 'argon2';
import { PasswordCredentials } from './password-credentials';
import { UsersRepository } from './users.repository';
import { SignInFailures } from './sign-in-failures';
import { Clock } from '../platform/clock';
import { authError } from './auth.errors';

const userId = '019a76de-f000-7000-8000-000000000001';
const subject = { target: '01712345678', userId };
let encoded: string;
let failures = 0;
let now = new Date('2026-11-14T00:00:00Z');
let disabled = false;
const service = new PasswordCredentials(
  {
    lockForSignIn: async () => ({ id: userId, passwordHash: encoded, isDisabled: disabled }),
  } as unknown as UsersRepository,
  {
    assertAllowed: async () => {
      if (failures >= 5) throw authError('AUTH_LOCKED');
    },
    recordFailure: async () => {
      if (++failures >= 5) throw authError('AUTH_LOCKED');
    },
  } as unknown as SignInFailures,
  { now: () => now } as Clock,
);

describe('Password credential proof', () => {
  beforeAll(async () => {
    encoded = await hash('originalpass1');
  });
  beforeEach(() => {
    failures = 0;
    disabled = false;
    now = new Date('2026-11-14T00:00:00Z');
  });
  it('counts wrong passwords toward the shared lock without resetting on first-factor success', async () => {
    for (let i = 0; i < 4; i++)
      await expect(service.check(subject, 'incorrect1', '192.0.2.1')).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    await service.check(subject, 'originalpass1', '192.0.2.1');
    expect(failures).toBe(4);
    await expect(service.check(subject, 'incorrect1', '192.0.2.1')).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
    await expect(service.check(subject, 'originalpass1', '192.0.2.1')).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    });
  });
  it('returns the same invalid-credentials code for an unknown account', async () => {
    await expect(
      service.check({ target: '01812345678' }, 'incorrect1', '192.0.2.1'),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: 401 });
    expect(failures).toBe(1);
  });
  it('refuses disabled accounts after valid password verification', async () => {
    disabled = true;
    await expect(service.check(subject, 'originalpass1', '192.0.2.1')).rejects.toMatchObject({
      code: 'AUTH_DISABLED',
    });
  });
  it('binds proof to the user and password state and expires it at ten minutes', async () => {
    const proof = await service.check(subject, 'originalpass1', '192.0.2.1');
    expect(JSON.stringify(proof)).not.toContain(encoded);
    expect(() => service.assertCurrent(userId, encoded, proof)).not.toThrow();
    expect(() => service.assertCurrent('another-user', encoded, proof)).toThrow();
    expect(() => service.assertCurrent(userId, null, proof)).toThrow();
    now = new Date(now.getTime() + 600_000);
    expect(() => service.assertCurrent(userId, encoded, proof)).toThrow();
  });
});
