import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Job, Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEnv } from '../../platform/config/env';
import { ErrorReporter } from '../../platform/logging/error-reporter';
import { TransactionalJobDispatcher } from '../../platform/queue/job-dispatcher';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { StaffAlertsService } from '../staff-alerts.service';
import { STAFF_ALERT_DELIVERY, StaffAlertDeliveryJob } from './staff-alert-delivery.job';

let application: INestApplicationContext | undefined;

async function settle(queue: Queue, data: unknown) {
  const { id } = await queue.add(STAFF_ALERT_DELIVERY, data, { jobId: randomUUID() });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job: Job | undefined = await queue.getJob(id!);
    if (job?.finishedOn) return job;
    await setTimeout(50);
  }
  throw new Error('Staff alert delivery job did not finish');
}

afterEach(async () => {
  vi.restoreAllMocks();
  await application?.close();
  application = undefined;
});
describe('Staff alert worker lifecycle', () => {
  it('parses global job IDs and records sanitized failures for bounded BullMQ retry', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const reporter = new ErrorReporter(undefined);
    const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
    const deliver = vi.fn().mockRejectedValue(new Error('private-token'));
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
        StaffAlertDeliveryJob,
        { provide: StaffAlertsService, useValue: { deliver } },
        { provide: ErrorReporter, useValue: reporter },
        TransactionalJobDispatcher,
      ],
    })(TestModule);
    application = await NestFactory.createApplicationContext(TestModule, {
      logger: false,
      abortOnError: false,
    });
    const queue = application.get<Queue>(getQueueToken(QUEUES.transactional));

    const failed = await settle(queue, { auditId: randomUUID() });
    expect(await failed.getState()).toBe('failed');
    expect(failed.failedReason).toBe('Staff alert delivery job failed');
    expect(JSON.stringify(failed.stacktrace)).not.toContain('private-token');
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(expect.anything(), failed.id);
    expect(JSON.stringify(report.mock.calls)).not.toContain('private-token');

    deliver.mockResolvedValue(undefined);
    const delivered = await settle(queue, { auditId: randomUUID() });
    expect(await delivered.getState()).toBe('completed');
    expect(delivered.progress).toBe(100);

    const invalid = await settle(queue, { auditId: 'bad-id' });
    expect(await invalid.getState()).toBe('failed');
    expect(invalid.failedReason).toBe('Staff alert delivery job failed');
    expect(report).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledTimes(2);
  });
});
