import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEnv } from '../../platform/config/env';
import { ErrorReporter } from '../../platform/logging/error-reporter';
import { jobLogBindings } from '../../platform/logging/job-context';
import { BulkJobDispatcher, TransactionalJobDispatcher } from '../../platform/queue/job-dispatcher';
import { scheduleJob } from '../../platform/queue/job-schedule';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { StaffAlertsService } from '../staff-alerts.service';
import { StaffHistoryService } from '../staff-history.service';
import { STAFF_ALERT_RELAY, StaffAlertRelayJob } from './staff-alert-relay.job';
import { STAFF_AUDIT_MAINTENANCE, StaffAuditMaintenanceJob } from './staff-audit-maintenance.job';

afterEach(() => vi.restoreAllMocks());

describe('Staff scheduled job failures', () => {
  it.each(['alerts', 'maintenance'])(
    'reports and logs a %s failure once, in the failed run, without its text',
    async (kind) => {
      const work: string[] = [];
      const logs: string[] = [];
      const fail = async () => {
        work.push(jobLogBindings().jobId!);
        throw new Error('private-provider-token');
      };
      const reporter = new ErrorReporter(undefined);
      const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
        logs.push(jobLogBindings().jobId!);
      });
      const [queueName, name, providers] =
        kind === 'alerts'
          ? ([
              QUEUES.transactional,
              STAFF_ALERT_RELAY,
              [
                StaffAlertRelayJob,
                TransactionalJobDispatcher,
                { provide: StaffAlertsService, useValue: { pending: fail } },
              ],
            ] as const)
          : ([
              QUEUES.bulk,
              STAFF_AUDIT_MAINTENANCE,
              [
                StaffAuditMaintenanceJob,
                BulkJobDispatcher,
                {
                  provide: StaffHistoryService,
                  useValue: { maintain: fail, pending: async () => [] },
                },
              ],
            ] as const);
      class TestModule {}
      Module({
        imports: [
          DiscoveryModule,
          BullModule.forRoot({
            connection: toRedisConnection(loadEnv().REDIS_URL),
            prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
          }),
          BullModule.registerQueue({ name: queueName }),
        ],
        providers: [...providers, { provide: ErrorReporter, useValue: reporter }],
      })(TestModule);
      const application = await NestFactory.createApplicationContext(TestModule, {
        logger: false,
        abortOnError: false,
      });
      try {
        const queue = application.get<Queue>(getQueueToken(queueName));
        await scheduleJob(queue, name);
        for (let attempt = 0; attempt < 100 && report.mock.calls.length === 0; attempt += 1)
          await setTimeout(25);
        await setTimeout(200);
        expect(work).toHaveLength(1);
        expect(work[0]!.startsWith(`repeat:${name}:`)).toBe(true);
        expect(logs).toEqual(work);
        expect(report.mock.calls.map(([, jobId]) => jobId)).toEqual(work);
        expect(JSON.stringify(report.mock.calls)).not.toContain('private-provider-token');
      } finally {
        await application.close();
      }
    },
  );
});
