import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { EmailService } from '../../email/email.service';
import { loadEnv } from '../../platform/config/env';
import { DatabaseModule } from '../../platform/database/database.module';
import { ErrorReportingModule } from '../../platform/logging/error-reporting.module';
import { TransactionalJobDispatcher } from '../../platform/queue/job-dispatcher';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { SmsService } from '../../sms/sms.service';
import { SecurityNoticesModule } from '../security-notices.module';
import { SecurityNoticesRepository } from '../security-notices.repository';
import { SecurityNoticesService } from '../security-notices.service';
import {
  SEND_DUE_SECURITY_NOTICES,
  SendDueSecurityNoticesJob,
} from './send-due-security-notices.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const userId = randomUUID();

afterAll(async () => {
  vi.restoreAllMocks();
  await admin.pool.query('delete from account_security_notices where user_id=$1', [userId]);
  await admin.pool.query('delete from users where id=$1', [userId]);
  await admin.pool.end();
});

describe('Overlapping security notice sweeps', () => {
  it('send each due notice exactly once, including notices beyond one sweep', async () => {
    const sent: string[] = [];
    vi.spyOn(EmailService.prototype, 'send').mockImplementation(async (message) => {
      sent.push(message.to);
    });
    // Notices left by other tests may also be due; they must never reach a real provider.
    vi.spyOn(SmsService.prototype, 'send').mockResolvedValue(undefined);
    // Both sweeps reach the claim before either runs it, so they claim at the same moment.
    const claim = SecurityNoticesRepository.prototype.claim;
    let claims = 0;
    let bothClaiming!: () => void;
    const overlap = new Promise<void>((resolve) => (bothClaiming = resolve));
    vi.spyOn(SecurityNoticesRepository.prototype, 'claim').mockImplementation(async function (
      this: SecurityNoticesRepository,
      filter,
    ) {
      if (++claims === 2) bothClaiming();
      await overlap;
      return claim.call(this, filter);
    });
    class TestModule {}
    Module({
      imports: [
        DiscoveryModule,
        DatabaseModule,
        ErrorReportingModule,
        SecurityNoticesModule,
        BullModule.forRoot({
          connection: toRedisConnection(loadEnv().REDIS_URL),
          prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
        }),
        BullModule.registerQueue({ name: QUEUES.transactional }),
      ],
      providers: [SendDueSecurityNoticesJob, TransactionalJobDispatcher],
    })(TestModule);
    const application = await NestFactory.createApplicationContext(TestModule, { logger: false });
    try {
      await admin.pool.query(
        "insert into users(id,name,phone,phone_verified_at) values($1,'Notice owner',$2,now())",
        [userId, `017${randomInt(10000000, 99999999)}`],
      );
      // One sweep claims twenty, so thirty notices need both sweeps.
      const addresses = Array.from({ length: 30 }, (_, index) => `${userId}-${index}@example.test`);
      const ids = await application.get(SecurityNoticesService).enqueue(
        userId,
        addresses.map((to) => ({ channel: 'email', to, text: 'Security notice' })),
      );
      // Oldest first, so these are claimed before any notice another test left due.
      await admin.pool.query(
        "update account_security_notices set retry_at='2000-01-01' where id=any($1::uuid[])",
        [ids],
      );
      const queue = application.get<Queue>(getQueueToken(QUEUES.transactional));
      const sweeps = await queue.addBulk([
        { name: SEND_DUE_SECURITY_NOTICES, data: {} },
        { name: SEND_DUE_SECURITY_NOTICES, data: {} },
      ]);
      for (let attempt = 0; attempt < 200; attempt++) {
        const states = await Promise.all(sweeps.map((sweep) => queue.getJobState(sweep.id!)));
        if (states.every((state) => state === 'completed' || state === 'failed')) break;
        await setTimeout(25);
      }
      expect(await Promise.all(sweeps.map((sweep) => queue.getJobState(sweep.id!)))).toEqual([
        'completed',
        'completed',
      ]);
      expect(sent.filter((to) => to.startsWith(userId)).sort()).toEqual([...addresses].sort());
      const delivered = await admin.pool.query(
        'select count(*)::int as count from account_security_notices where id=any($1::uuid[]) and delivered_at is not null',
        [ids],
      );
      expect(delivered.rows[0].count).toBe(30);
    } finally {
      await application.close();
    }
  });
});
