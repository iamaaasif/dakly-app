import { describe, expect, it } from 'vitest';
import { SupportService } from './support.service';
import { AppError } from '../platform/errors/app-error';
import { supportError } from './support.errors';

const now = new Date('2026-11-15T00:00:00Z');
function service(failure: Error, atSubject = false) {
  const dependencies = [
    {
      targets: async () => [{ id: 'store' }],
      staff: async () => ({ id: 'staff', role: 'support', status: 'active', enrolledAt: now }),
      parent: async () => ({
        revokedAt: null,
        expiresAt: new Date('2026-11-15T08:00:00Z'),
        lastSeenAt: now,
      }),
      owner: async () => 'owner',
      insert: async () => {},
      find: async () => ({
        id: 'grant',
        storeId: 'store',
        staffUserId: 'staff',
        staffName: 'Rina',
        reason: 'Investigate customer issue',
        isBreakGlass: false,
        status: 'requested',
        requestedAt: now,
        expiresAt: null,
        access: 'read',
        scopes: ['customers'],
        durationMinutes: 30,
      }),
    },
    {
      run: async (_: string, work: () => Promise<unknown>) => work(),
      runLocked: async (_: string, work: () => Promise<unknown>) => work(),
    },
    { now: () => now },
    { conflictsWithStore: async () => false },
    { record: async () => {} },
    {},
    {
      lockVerifiedIdentity: async () => {
        if (atSubject) throw failure;
        return { phone: '01712345678', phoneVerifiedAt: now };
      },
    },
    {
      send: async () => {
        throw failure;
      },
    },
    {},
  ] as unknown as ConstructorParameters<typeof SupportService>;
  return new SupportService(...dependencies);
}
function request(subject: SupportService) {
  return subject.request(
    { id: 'staff', name: 'Rina', role: 'support', sessionId: 'session' },
    {
      targetId: 'store',
      reason: 'Investigate customer issue',
      access: 'read',
      scopes: ['customers'],
      durationMinutes: 30,
    },
    '127.0.0.1',
  );
}

describe('SupportService', () => {
  it.each([
    'AUTH_SMS_UNAVAILABLE',
    'AUTH_EMAIL_UNAVAILABLE',
    'AUTH_RATE_LIMITED',
    'AUTH_LOCKED',
  ] as const)('leaves consent pending for %s', async (code) => {
    expect(
      await request(
        service(
          new AppError(code, {
            status:
              code === 'AUTH_SMS_UNAVAILABLE' || code === 'AUTH_EMAIL_UNAVAILABLE' ? 503 : 429,
            message: 'Code cannot be sent now',
          }),
        ),
      ),
    ).toMatchObject({ codeSent: false });
  });
  it('leaves consent pending when the Owner needs a verified phone', async () => {
    expect(await request(service(supportError('SUPPORT_PHONE_REQUIRED'), true))).toMatchObject({
      codeSent: false,
    });
  });
  it.each([
    new Error('Database unavailable'),
    new TypeError('Unexpected bug'),
    supportError('SUPPORT_DENIED'),
  ])('propagates unexpected failures: %s', async (failure) => {
    await expect(request(service(failure))).rejects.toBe(failure);
    await expect(request(service(failure, true))).rejects.toBe(failure);
  });
});
