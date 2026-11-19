import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEnv } from '../config/env';
import { ErrorReporter } from '../logging/error-reporter';
import { jobLogBindings } from '../logging/job-context';
import {
  AiReplyJobDispatcher,
  BulkJobDispatcher,
  CampaignJobDispatcher,
  InboundJobDispatcher,
  OutboundJobDispatcher,
  SyncJobDispatcher,
  TransactionalJobDispatcher,
  WorkflowJobDispatcher,
} from './job-dispatcher';
import { HandlesJob, type JobHandler } from './job-handler';
import { scheduleJob } from './job-schedule';
import { QUEUES, type QueueName, WORKER_QUEUES } from './queues';
import { toRedisConnection } from './redis-connection';

const SCHEDULED = 'scheduled-test-job';
const runs: string[] = [];
let work: () => ReturnType<JobHandler['handle']> = async () => {};

class TransactionalScheduledHandler implements JobHandler {
  async handle() {
    runs.push(jobLogBindings().jobId!);
    return work();
  }
}

class InboundScheduledHandler extends TransactionalScheduledHandler {}

class AiReplyScheduledHandler extends TransactionalScheduledHandler {}

class OutboundScheduledHandler extends TransactionalScheduledHandler {}

class SyncScheduledHandler extends TransactionalScheduledHandler {}

class BulkScheduledHandler extends TransactionalScheduledHandler {}

class CampaignScheduledHandler extends TransactionalScheduledHandler {}

class WorkflowScheduledHandler extends TransactionalScheduledHandler {}

HandlesJob({ queue: QUEUES.inbound, name: SCHEDULED })(InboundScheduledHandler);
HandlesJob({ queue: QUEUES.aiReply, name: SCHEDULED })(AiReplyScheduledHandler);
HandlesJob({ queue: QUEUES.outbound, name: SCHEDULED })(OutboundScheduledHandler);
HandlesJob({ queue: QUEUES.sync, name: SCHEDULED })(SyncScheduledHandler);
HandlesJob({ queue: QUEUES.transactional, name: SCHEDULED })(TransactionalScheduledHandler);
HandlesJob({ queue: QUEUES.bulk, name: SCHEDULED })(BulkScheduledHandler);
HandlesJob({ queue: QUEUES.campaign, name: SCHEDULED })(CampaignScheduledHandler);
HandlesJob({ queue: QUEUES.workflow, name: SCHEDULED })(WorkflowScheduledHandler);

const setups = {
  inbound: [InboundScheduledHandler, InboundJobDispatcher],
  'ai-reply': [AiReplyScheduledHandler, AiReplyJobDispatcher],
  outbound: [OutboundScheduledHandler, OutboundJobDispatcher],
  sync: [SyncScheduledHandler, SyncJobDispatcher],
  transactional: [TransactionalScheduledHandler, TransactionalJobDispatcher],
  bulk: [BulkScheduledHandler, BulkJobDispatcher],
  workflow: [WorkflowScheduledHandler, WorkflowJobDispatcher],
  campaign: [CampaignScheduledHandler, CampaignJobDispatcher],
} satisfies Record<QueueName, unknown[]>;

const reporter = new ErrorReporter(undefined);
const applications: INestApplicationContext[] = [];

async function start(queueName: QueueName, prefix: string) {
  class TestModule {}
  Module({
    imports: [
      DiscoveryModule,
      BullModule.forRoot({ connection: toRedisConnection(loadEnv().REDIS_URL), prefix }),
      BullModule.registerQueue({ name: queueName }),
    ],
    providers: [...setups[queueName], { provide: ErrorReporter, useValue: reporter }],
  })(TestModule);
  const application = await NestFactory.createApplicationContext(TestModule, {
    logger: false,
    abortOnError: false,
  });
  applications.push(application);
  return { application, queue: application.get<Queue>(getQueueToken(queueName)) };
}

async function until(condition: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await setTimeout(25);
  }
  throw new Error('Condition not reached');
}

async function promoteNextTick(queue: Queue) {
  const [next] = await queue.getDelayed();
  await next!.promote();
}

afterEach(async () => {
  vi.restoreAllMocks();
  runs.length = 0;
  work = async () => {};
  await Promise.all(applications.splice(0).map((application) => application.close()));
});

describe.each(WORKER_QUEUES)('Scheduled job on %s', (queueName) => {
  it('runs one job per interval across two workers, each in its own job context', async () => {
    const prefix = `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`;
    const first = await start(queueName, prefix);
    const second = await start(queueName, prefix);
    await Promise.all([
      scheduleJob(first.queue, SCHEDULED),
      scheduleJob(second.queue, SCHEDULED),
      scheduleJob(first.queue, SCHEDULED),
    ]);
    expect(await first.queue.getJobSchedulers()).toEqual([
      expect.objectContaining({ key: SCHEDULED, name: SCHEDULED, every: 30000 }),
    ]);
    await until(() => runs.length === 1);
    await until(async () => (await first.queue.getDelayedCount()) === 1);
    await setTimeout(300);
    expect(runs).toHaveLength(1);
    await promoteNextTick(second.queue);
    await until(() => runs.length === 2);
    await setTimeout(300);
    expect(runs).toHaveLength(2);
    expect(runs.every((jobId) => jobId.startsWith(`repeat:${SCHEDULED}:`))).toBe(true);
    expect(runs[0]).not.toBe(runs[1]);
    expect(jobLogBindings()).toEqual({});
  });

  // Inbound, transactional and workflow run five jobs at once, so the next tick starts beside the active run.
  const overlapping =
    queueName === QUEUES.bulk || queueName === QUEUES.campaign || queueName === QUEUES.sync ? 1 : 2;
  it(`runs ${overlapping} tick(s) at once on one worker and waits for them at shutdown`, async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    work = () => pending;
    const { application, queue } = await start(
      queueName,
      `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
    );
    await scheduleJob(queue, SCHEDULED);
    await until(() => runs.length === 1);
    await until(async () => (await queue.getDelayedCount()) === 1);
    await promoteNextTick(queue);
    await until(() => runs.length === overlapping);
    await setTimeout(300);
    expect(runs).toHaveLength(overlapping);
    let stopped = false;
    const shutdown = application.close().then(() => {
      stopped = true;
    });
    await setTimeout(300);
    expect(stopped).toBe(false);
    finish();
    await shutdown;
    applications.splice(applications.indexOf(application), 1);
    expect(stopped).toBe(true);
    await setTimeout(300);
    expect(runs).toHaveLength(overlapping);
  });

  it('retries a failed run with bounded backoff and reports each failure once without its text', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
    work = async () => {
      throw new Error('private-scheduled-failure');
    };
    const { queue } = await start(queueName, `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`);
    await scheduleJob(queue, SCHEDULED);
    await until(() => runs.length === 1);
    const jobId = runs[0]!;
    for (const attemptsMade of [1, 2]) {
      await until(async () => (await queue.getJobState(jobId)) === 'delayed');
      const job = (await queue.getJob(jobId))!;
      expect(job.attemptsMade).toBe(attemptsMade);
      expect(job.opts).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });
      await job.promote();
      await until(() => runs.length === attemptsMade + 1);
    }
    await until(async () => (await queue.getJobState(jobId)) === 'failed');
    const failed = (await queue.getJob(jobId))!;
    expect(failed.attemptsMade).toBe(3);
    expect(failed.failedReason).toBe('Scheduled test job job failed');
    expect(JSON.stringify(failed.stacktrace)).not.toContain('private-scheduled-failure');
    expect(runs).toEqual([jobId, jobId, jobId]);
    expect(report).toHaveBeenCalledTimes(3);
    expect(report.mock.calls.map(([, reportedId]) => reportedId)).toEqual([jobId, jobId, jobId]);
    expect(JSON.stringify(report.mock.calls)).not.toContain('private-scheduled-failure');
  });
});

it('delays an AI reply without counting a failed attempt', async () => {
  const prefix = `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`;
  const { queue } = await start(QUEUES.aiReply, prefix);
  work = async () => {
    if (runs.length === 1) return { delayUntil: Date.now() + 30_000 };
  };
  const job = await queue.add(SCHEDULED, {}, { attempts: 1 });
  await until(async () => (await job.getState()) === 'delayed');
  expect(await queue.getJob(job.id!)).toMatchObject({ attemptsMade: 0 });
  await job.promote();
  await until(async () => (await job.getState()) === 'completed');
  expect(runs).toEqual([job.id, job.id]);
});

describe('Calendar schedules', () => {
  it('schedules UTC midnight and keeps a pending job on restart', async () => {
    const prefix = `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`;
    const { queue } = await start(QUEUES.bulk, prefix);
    await scheduleJob(queue, SCHEDULED, { pattern: '0 0 * * *', tz: 'UTC' });
    const [scheduled] = await queue.getJobSchedulers();
    expect(scheduled).toMatchObject({ name: SCHEDULED, pattern: '0 0 * * *', tz: 'UTC' });
    expect(new Date(scheduled?.next ?? 1).toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(scheduled?.next).toBeGreaterThan(Date.now());

    await queue.pause();
    const [pending] = await queue.getDelayed();
    await pending!.promote();
    await scheduleJob(queue, SCHEDULED, { pattern: '0 0 * * *', tz: 'UTC' });
    expect(await queue.getDelayedCount()).toBe(0);
    expect((await queue.getJobs(['paused'])).map(({ id }) => id)).toEqual([pending?.id]);
  });
});
