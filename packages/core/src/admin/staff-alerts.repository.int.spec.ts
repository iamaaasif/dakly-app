import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { StaffAlertsModule } from './staff-alerts.module';
import { StaffAlertsRepository } from './staff-alerts.repository';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const staffUserId = randomUUID();

afterAll(async () => {
  await admin.pool.query(
    'delete from staff_alert_deliveries where audit_id in (select id from staff_audit_log where staff_user_id=$1)',
    [staffUserId],
  );
  await admin.pool.query('delete from staff_audit_log where staff_user_id=$1', [staffUserId]);
  await admin.pool.query('delete from staff_users where id=$1', [staffUserId]);
  await admin.pool.end();
});

async function waitForBlockedSweep() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { rows } = await admin.pool.query(
      `select 1 from pg_stat_activity
       where wait_event_type='Lock' and query like '%Delivery stopped after five attempts%'`,
    );
    if (rows.length > 0) return;
    await setTimeout(25);
  }
  throw new Error('The pending sweep never waited for the retried alert');
}

describe('StaffAlertsRepository', () => {
  it('keeps a staff retry that commits while the pending sweep waits for its row', async () => {
    class TestModule {}
    Module({ imports: [DatabaseModule, StaffAlertsModule] })(TestModule);
    const application = await NestFactory.createApplicationContext(TestModule, { logger: false });
    try {
      const repository = application.get(StaffAlertsRepository);
      const transaction = application.get(StaffTransaction);
      await admin.pool.query(
        "insert into staff_users(id,email,name,role) values($1,$2,'Rahima Akter','super_admin')",
        [staffUserId, `${staffUserId}@example.test`],
      );
      const auditId = randomUUID();
      await admin.pool.query(
        `insert into staff_audit_log(id,staff_user_id,action,store_id,reason)
         values($1,$2,'support.break_glass_opened',gen_random_uuid(),'Retry race check')`,
        [auditId, staffUserId],
      );
      await admin.pool.query(
        "insert into staff_alert_deliveries(audit_id,attempts,next_attempt_at) values($1,5,'2000-01-01')",
        [auditId],
      );

      const now = new Date();
      let commitRetry!: () => void;
      const retryHeld = new Promise<void>((resolve) => (commitRetry = resolve));
      let retryApplied!: () => void;
      const retryWritten = new Promise<void>((resolve) => (retryApplied = resolve));
      const retry = transaction.run(staffUserId, async () => {
        await repository.retry(staffUserId, {
          auditId,
          reason: 'Slack fixed',
          ip: '127.0.0.1',
          now,
        });
        retryApplied();
        await retryHeld;
      });
      await retryWritten;
      let isSweepDone = false;
      const sweep = repository.pending(now).then(() => (isSweepDone = true));
      await waitForBlockedSweep();
      expect(isSweepDone).toBe(false);
      commitRetry();
      await retry;
      await sweep;

      const { rows } = await admin.pool.query(
        'select status, attempts, error from staff_alert_deliveries where audit_id=$1',
        [auditId],
      );
      expect(rows).toEqual([{ status: 'pending', attempts: 0, error: null }]);
    } finally {
      await application.close();
    }
  });
});
