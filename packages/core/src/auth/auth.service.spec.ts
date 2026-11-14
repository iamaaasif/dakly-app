import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { UsersRepository } from './users.repository';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures } from './sign-in-failures';
import { SessionsService } from '../sessions/sessions.service';
import { AccountTransaction } from '../platform/database/account-transaction';
import { Clock } from '../platform/clock';

const userId = '019a76de-f000-7000-8000-000000000001';
const target = '01712345678';
const now = new Date('2026-11-13T12:00:00Z');
const request = { ip: '192.0.2.1', isRemembered: false };
const issued: string[] = [];
let user = { id: userId, phone: target, isDisabled: false, totpEnabledAt: null as Date | null };
let remainingFailures = 4;
let lastSignInAt: Date | undefined;
const repository = {
  lockForSignIn: async () => user,
  signedIn: async (_userId: string, date: Date) => {
    lastSignInAt = date;
  },
};
const failureState = {
  assertAllowed: async () => undefined,
  reset: async () => {
    remainingFailures = 0;
  },
};
const service = new AuthService(
  repository as unknown as UsersRepository,
  {} as SignInCodes,
  failureState as unknown as SignInFailures,
  {
    create: async (id: string) => {
      issued.push(id);
      return { token: 'internal-token' };
    },
  } as unknown as SessionsService,
  { run: async (_id: string, work: () => Promise<unknown>) => work() } as AccountTransaction,
  { now: () => now } as Clock,
  {} as AccountSecurityEventsService,
);

describe('AuthService completion gate', () => {
  beforeEach(() => {
    issued.length = 0;
    remainingFailures = 4;
    lastSignInAt = undefined;
    user = { id: userId, phone: target, isDisabled: false, totpEnabledAt: null };
  });

  it('issues the session and clears consecutive failures only after completed sign-in', async () => {
    const result = await service.completeSignIn({ id: userId, target }, request);
    expect(result.token).toBe('internal-token');
    expect(issued).toEqual([userId]);
    expect(remainingFailures).toBe(0);
    expect(lastSignInAt).toEqual(now);
  });

  it.each([
    { change: { totpEnabledAt: now }, code: 'AUTH_SECOND_FACTOR_REQUIRED' },
    { change: { isDisabled: true }, code: 'AUTH_DISABLED' },
    { change: { phone: '01812345678' }, code: 'AUTH_CODE_INVALID' },
  ])('refuses $code without issuing or resetting failure history', async ({ change, code }) => {
    user = { ...user, ...change };
    await expect(service.completeSignIn({ id: userId, target }, request)).rejects.toMatchObject({
      code,
    });
    expect(issued).toEqual([]);
    expect(remainingFailures).toBe(4);
    expect(lastSignInAt).toBeUndefined();
  });
});
