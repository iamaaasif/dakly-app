import 'reflect-metadata';
import { createSecretKey, randomBytes, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecurityNoticesService } from '@dakly/core/auth/security-notices.service';
import type { SecurityNoticesRepository } from '@dakly/core/auth/security-notices.repository';
import type { AccountRecoveryRepository } from '@dakly/core/auth/account-recovery.repository';
import type { UsersRepository } from '@dakly/core/auth/users.repository';
import type { AccountTransaction } from '@dakly/core/platform/database/account-transaction';
import { EnvelopeEncryption } from '@dakly/core/platform/crypto/envelope-encryption';
import { EmailService } from '@dakly/core/email/email.service';
import type { SmsService } from '@dakly/core/sms/sms.service';
import { Clock } from '@dakly/core/platform/clock';
import { ErrorReporter } from '@dakly/core/platform/logging/error-reporter';
import { AccountSecurityNoticesJob } from '../src/account-security-notices.job';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe('Security notice shutdown after retry persistence failure', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('waits for the other vendor and its acknowledgement before dispatch or shutdown completes', async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const errors: unknown[][] = [];
    const warnings: unknown[][] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((...values: unknown[]) => {
      errors.push(values);
    });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((...values: unknown[]) => {
      warnings.push(values);
    });
    const vendor = deferred();
    const acknowledgement = deferred();
    const acknowledged = deferred();
    const userId = randomUUID();
    const encryption = new EnvelopeEncryption({
      currentKeyVersion: 1,
      masterKeys: new Map([[1, createSecretKey(randomBytes(32))]]),
    });
    const notices = ['failed@example.test', 'deferred@example.test'].map((to) => ({
      id: randomUUID(),
      userId,
      recoveryId: null,
      leaseId: randomUUID(),
      attempts: 1,
      ...encryption.encrypt(
        { owner: 'user', userId, purpose: 'account-security-notice' },
        Buffer.from(JSON.stringify({ channel: 'email', to, text: 'private-notice' })),
      ),
    }));
    let claims = 0;
    let retryWriteFailed = false;
    let vendorFinished = false;
    const service = new SecurityNoticesService(
      {
        claim: async () => {
          claims++;
          return claims === 1 ? notices : [];
        },
        failed: async () => {
          retryWriteFailed = true;
          throw new Error('private-retry-write');
        },
        delivered: async () => {
          await acknowledgement.promise;
          acknowledged.resolve();
          return true;
        },
      } as unknown as SecurityNoticesRepository,
      {} as AccountRecoveryRepository,
      { lockForSignIn: async () => ({ id: userId }) } as unknown as UsersRepository,
      { run: async (_id: string, work: () => Promise<unknown>) => work() } as AccountTransaction,
      encryption,
      new EmailService({
        send: async (message) => {
          if (message.to === 'failed@example.test') throw new Error('private-provider-failure');
          await vendor.promise;
          vendorFinished = true;
        },
      }),
      {} as SmsService,
      new Clock(),
      new ErrorReporter(),
    );
    const job = new AccountSecurityNoticesJob(service);
    job.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(retryWriteFailed).toBe(true);
    let shutdownFinished = false;
    const shutdown = job.onApplicationShutdown().then(() => {
      shutdownFinished = true;
    });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(shutdownFinished).toBe(false);
      expect(vendorFinished).toBe(false);
      vendor.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(vendorFinished).toBe(true);
      expect(shutdownFinished).toBe(false);
      acknowledgement.resolve();
      await shutdown;
      expect(shutdownFinished).toBe(true);
      expect(claims).toBe(1);
      expect(errors).toEqual([[{ event: 'security' }, 'Account security notice polling failed']]);
      expect(warnings).toHaveLength(1);
      expect(JSON.stringify([...warnings, ...errors])).not.toContain('private-');
    } finally {
      vendor.resolve();
      acknowledgement.resolve();
      await acknowledged.promise;
      await shutdown;
    }
  });
});
