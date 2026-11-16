import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { loadEnv } from '../../platform/config/env';
import { DatabaseModule } from '../../platform/database/database.module';
import { ErrorReportingModule } from '../../platform/logging/error-reporting.module';
import { TransactionalJobDispatcher } from '../../platform/queue/job-dispatcher';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { StaffAlertsModule } from '../staff-alerts.module';
import { StaffAlertsRepository } from '../staff-alerts.repository';
import { STAFF_ALERT_DELIVERY } from './staff-alert-delivery.job';
import { STAFF_ALERT_RELAY, StaffAlertRelayJob } from './staff-alert-relay.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const staffUserId = randomUUID();

afterAll(async () => {
  vi.restoreAllMocks();
  await admin.pool.query(
    'delete from staff_alert_deliveries where audit_id in (select id from staff_audit_log where staff_user_id=$1)',
    [staffUserId],
  );
  await admin.pool.query('delete from staff_audit_log where staff_user_id=$1', [staffUserId]);
  await admin.pool.query('delete from staff_users where id=$1', [staffUserId]);
  await admin.pool.end();
});

describe('Overlapping staff alert relays', () => {
  it('queue each pending alert exactly once, including alerts beyond one relay', async () => {
    // Both relays reach the pending query before either runs it, so they read at the same moment.
    const pending = StaffAlertsRepository.prototype.pending;
    let reads = 0;
    let bothReading!: () => void;
    const overlap = new Promise<void>((resolve) => (bothReading = resolve));
    vi.spyOn(StaffAlertsRepository.prototype, 'pending').mockImplementation(async function (
      this: StaffAlertsRepository,
      now,
    ) {
      if (++reads === 2) bothReading();
      await overlap;
      return pending.call(this, now);
    });
    class TestModule {}
    Module({
      imports: [
        DiscoveryModule,
        DatabaseModule,
        ErrorReportingModule,
        StaffAlertsModule,
        BullModule.forRoot({
          connection: toRedisConnection(loadEnv().REDIS_URL),
          prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
        }),
        BullModule.registerQueue({ name: QUEUES.transactional }),
      ],
      // Delivery has no handler here, so every queued delivery job stays countable as failed.
      providers: [StaffAlertRelayJob, TransactionalJobDispatcher],
    })(TestModule);
    const application = await NestFactory.createApplicationContext(TestModule, { logger: false });
    try {
      await admin.pool.query(
        "insert into staff_users(id,email,name,role) values($1,$2,'Relay staff','super_admin')",
        [staffUserId, `${staffUserId}@example.test`],
      );
      // One relay takes twenty, so twenty-five alerts need both relays. Oldest first, so these
      // are read before any alert another test left pending.
      const audits = await admin.pool.query<{ id: string }>(
        `insert into staff_audit_log(id,staff_user_id,action,store_id,reason)
         select gen_random_uuid(),$1,'support.break_glass_opened',gen_random_uuid(),'Overlapping relay check'
         from generate_series(1,25)
         returning id`,
        [staffUserId],
      );
      const auditIds = audits.rows.map((row) => row.id);
      await admin.pool.query(
        "insert into staff_alert_deliveries(audit_id,next_attempt_at) select unnest($1::uuid[]),'2000-01-01'",
        [auditIds],
      );
      const queue = application.get<Queue>(getQueueToken(QUEUES.transactional));
      const relays = await queue.addBulk([
        { name: STAFF_ALERT_RELAY, data: {} },
        { name: STAFF_ALERT_RELAY, data: {} },
      ]);
      const states = () => Promise.all(relays.map((relay) => queue.getJobState(relay.id!)));
      for (let attempt = 0; attempt < 200; attempt++) {
        if ((await states()).every((state) => state === 'completed' || state === 'failed')) break;
        await setTimeout(25);
      }
      expect(await states()).toEqual(['completed', 'completed']);
      const queued = (await queue.getJobs(['waiting', 'active', 'delayed', 'failed', 'completed']))
        .filter((job) => job.name === STAFF_ALERT_DELIVERY)
        .map((job) => (job.data as { auditId: string }).auditId)
        .filter((auditId) => auditIds.includes(auditId));
      expect(queued.sort()).toEqual([...auditIds].sort());
    } finally {
      await application.close();
    }
  });
});
