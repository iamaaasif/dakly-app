import 'reflect-metadata';
import { createSecretKey, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmailService } from '../../email/email.service';
import { Clock } from '../../platform/clock';
import { loadEnv } from '../../platform/config/env';
import { EnvelopeEncryption } from '../../platform/crypto/envelope-encryption';
import type { AccountTransaction } from '../../platform/database/account-transaction';
import { ErrorReporter } from '../../platform/logging/error-reporter';
import { TransactionalJobDispatcher } from '../../platform/queue/job-dispatcher';
import { scheduleJob } from '../../platform/queue/job-schedule';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import type { SmsService } from '../../sms/sms.service';
import type { AccountRecoveryRepository } from '../account-recovery.repository';
import type { SecurityNoticesRepository } from '../security-notices.repository';
import { SecurityNoticesService } from '../security-notices.service';
import type { UsersRepository } from '../users.repository';
import {
  SEND_DUE_SECURITY_NOTICES,
  SendDueSecurityNoticesJob,
} from './send-due-security-notices.job';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await setTimeout(25);
  expect(condition()).toBe(true);
}

afterEach(() => vi.restoreAllMocks());

describe('Scheduled security notice sweep after retry persistence failure', () => {
  it('waits for the other vendor and its acknowledgement before the run or shutdown completes', async () => {
    const errors: unknown[][] = [];
    const warnings: unknown[][] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((...values: unknown[]) => {
      errors.push(values);
    });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((...values: unknown[]) => {
      warnings.push(values);
    });
    const reporter = new ErrorReporter(undefined);
    const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
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
      reporter,
    );
    class TestModule {}
    Module({
      imports: [
        DiscoveryModule,
        BullModule.forRoot({
          connection: toRedisConnection(loadEnv().REDIS_URL),
          prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
        }),
        BullModule.registerQueue({ name: QUEUES.transactional }),
      ],
      providers: [
        SendDueSecurityNoticesJob,
        TransactionalJobDispatcher,
        { provide: SecurityNoticesService, useValue: service },
        { provide: ErrorReporter, useValue: reporter },
      ],
    })(TestModule);
    const application = await NestFactory.createApplicationContext(TestModule, {
      logger: false,
      abortOnError: false,
    });
    const queue = application.get<Queue>(getQueueToken(QUEUES.transactional));
    await scheduleJob(queue, SEND_DUE_SECURITY_NOTICES);
    await until(() => retryWriteFailed);
    let shutdownFinished = false;
    const shutdown = application.close().then(() => {
      shutdownFinished = true;
    });
    try {
      await setTimeout(200);
      expect(shutdownFinished).toBe(false);
      expect(vendorFinished).toBe(false);
      vendor.resolve();
      await until(() => vendorFinished);
      await setTimeout(200);
      expect(shutdownFinished).toBe(false);
      acknowledgement.resolve();
      await shutdown;
      expect(shutdownFinished).toBe(true);
      expect(claims).toBe(1);
      const [jobId] = report.mock.calls.map(([, id]) => id);
      expect(jobId!.startsWith(`repeat:${SEND_DUE_SECURITY_NOTICES}:`)).toBe(true);
      expect(errors).toEqual([
        [{ event: 'security', jobId }, 'Send due security notices job failed'],
      ]);
      expect(warnings).toHaveLength(1);
      expect(report.mock.calls.map(([, id]) => id)).toEqual([jobId, jobId]);
      expect(JSON.stringify([...warnings, ...errors, ...report.mock.calls])).not.toContain(
        'private-',
      );
    } finally {
      vendor.resolve();
      acknowledgement.resolve();
      await acknowledged.promise;
      await shutdown;
    }
  });
});
