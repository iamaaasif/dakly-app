import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { verify } from 'argon2';
import { PasswordService } from './password.service';
import { PasswordCredentials } from './password-credentials';
import { UsersRepository } from './users.repository';
import { SignInCodes, type PasswordProof } from './sign-in-codes';
import { SignInFailures } from './sign-in-failures';
import { AuthService } from './auth.service';
import { AccountTransaction } from '../platform/database/account-transaction';
import { SessionsService } from '../sessions/sessions.service';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { authError } from './auth.errors';

const userId = '019a76de-f000-7000-8000-000000000001';
const phone = '01712345678';
const now = new Date('2026-11-14T00:00:00Z');
let storedHash: string | null;
let revoked: boolean;
let proof: PasswordProof;
let secondFactor: boolean;
let events: string[];
const repository = {
  findByPhone: async () => ({ id: userId, phone, email: null, emailVerifiedAt: null }),
  lockForSignIn: async () => ({
    id: userId,
    phone,
    phoneVerifiedAt: now,
    email: null,
    emailVerifiedAt: null,
    passwordHash: storedHash,
    isDisabled: false,
    totpEnabledAt: secondFactor ? now : null,
  }),
  changePassword: async (_id: string, encoded: string) => {
    storedHash = encoded;
  },
} as unknown as UsersRepository;
const failures = { assertAllowed: async () => undefined } as unknown as SignInFailures;
const clock = { now: () => now } as Clock;
const credentials = new PasswordCredentials(repository, failures, clock);
const service = new PasswordService(
  repository,
  credentials,
  { consume: async () => ({ userId, proof }) } as unknown as SignInCodes,
  failures,
  {
    completeSignIn: async () => {
      if (secondFactor) throw authError('AUTH_SECOND_FACTOR_REQUIRED');
      return { token: 'new-session' };
    },
  } as unknown as AuthService,
  { run: async (_id: string, work: () => Promise<unknown>) => work() } as AccountTransaction,
  {
    revokeAll: async () => {
      revoked = true;
    },
  } as unknown as SessionsService,
  {
    record: async (_id: string, value: { event: string }) => {
      events.push(value.event);
    },
  } as unknown as AccountSecurityEventsService,
  clock,
);
const input = { identifier: phone, code: '123456', password: 'newpassword1', isRemembered: false };
const request = { ip: '192.0.2.1', isRemembered: false };

describe('Password reset rules', () => {
  beforeEach(() => {
    storedHash = null;
    revoked = false;
    secondFactor = false;
    events = [];
    proof = credentials.proof(userId, storedHash);
  });
  it('changes the password and revokes sessions before returning the common sign-in result', async () => {
    expect((await service.confirmReset(input, request)).token).toBe('new-session');
    expect(await verify(storedHash!, input.password)).toBe(true);
    expect(revoked).toBe(true);
    expect(events).toEqual(['password.changed']);
  });
  it('keeps the reset and revocation when the common gate requires a second factor', async () => {
    secondFactor = true;
    await expect(service.confirmReset(input, request)).rejects.toMatchObject({
      code: 'AUTH_SECOND_FACTOR_REQUIRED',
    });
    expect(await verify(storedHash!, input.password)).toBe(true);
    expect(revoked).toBe(true);
  });
  it('refuses stale proof before changing the password or sessions', async () => {
    storedHash = 'newer-state';
    await expect(service.confirmReset(input, request)).rejects.toMatchObject({
      code: 'AUTH_PROOF_REQUIRED',
    });
    expect(storedHash).toBe('newer-state');
    expect(revoked).toBe(false);
    expect(events).toEqual([]);
  });
});
