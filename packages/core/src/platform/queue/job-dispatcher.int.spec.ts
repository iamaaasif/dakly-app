import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import { Job, type JobsOptions, type Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEnv } from '../config/env';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { ErrorReporter } from '../logging/error-reporter';
import { TransactionalJobDispatcher } from './job-dispatcher';
import { HandlesJob, type JobHandler } from './job-handler';
import { QUEUES } from './queues';
import { toRedisConnection } from './redis-connection';

const received: Record<string, unknown[]> = { first: [], second: [] };
let flakyCalls = 0;

class FirstHandler implements JobHandler {
  async handle(data: unknown) {
    received.first!.push(data);
  }
}

class SecondHandler implements JobHandler {
  async handle(data: unknown) {
    received.second!.push(data);
  }
}

class FlakyHandler implements JobHandler {
  async handle() {
    flakyCalls += 1;
    if (flakyCalls === 1) throw new Error('private-first-attempt');
  }
}

class ParkedHandler implements JobHandler {
  async handle() {
    throw new AppError('OUTBOX_EVENTS_PARKED', PLATFORM_ERRORS.OUTBOX_EVENTS_PARKED);
  }
}

class DuplicateFirstHandler implements JobHandler {
  async handle() {}
}

HandlesJob({ queue: QUEUES.transactional, name: 'first-test-job' })(FirstHandler);
HandlesJob({ queue: QUEUES.transactional, name: 'second-test-job' })(SecondHandler);
HandlesJob({ queue: QUEUES.transactional, name: 'flaky-test-job' })(FlakyHandler);
HandlesJob({ queue: QUEUES.transactional, name: 'parked-test-job' })(ParkedHandler);
HandlesJob({ queue: QUEUES.transactional, name: 'first-test-job' })(DuplicateFirstHandler);

const reporter = new ErrorReporter(undefined);
let application: INestApplicationContext | undefined;

async function start(handlers: (new () => JobHandler)[]) {
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
      ...handlers,
      { provide: ErrorReporter, useValue: reporter },
      TransactionalJobDispatcher,
    ],
  })(TestModule);
  application = await NestFactory.createApplicationContext(TestModule, {
    logger: false,
    abortOnError: false,
  });
  return application.get<Queue>(getQueueToken(QUEUES.transactional));
}

async function settle(queue: Queue, name: string, data: unknown, options?: JobsOptions) {
  const { id } = await queue.add(name, data, options);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job: Job | undefined = await queue.getJob(id!);
    if (job?.finishedOn) return job;
    await setTimeout(50);
  }
  throw new Error(`Job ${name} did not finish`);
}

afterEach(async () => {
  vi.restoreAllMocks();
  received.first = [];
  received.second = [];
  flakyCalls = 0;
  await application?.close();
  application = undefined;
});

describe('Job dispatcher (Valkey)', () => {
  it('gives each handler on one queue only the jobs with its name', async () => {
    const queue = await start([FirstHandler, SecondHandler]);
    await settle(queue, 'first-test-job', { value: 1 });
    await settle(queue, 'second-test-job', { value: 2 });
    await settle(queue, 'first-test-job', { value: 3 });
    expect(received).toEqual({ first: [{ value: 1 }, { value: 3 }], second: [{ value: 2 }] });
  });

  it('fails a job with an unknown name without retrying it', async () => {
    const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
    const queue = await start([FirstHandler]);
    const job = await settle(queue, 'missing-test-job', {}, { attempts: 3 });
    expect(await job.getState()).toBe('failed');
    expect(job.attemptsMade).toBe(1);
    expect(job.failedReason).toBe('No handler for job missing-test-job on queue transactional');
    expect(received.first).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it('rejects a job without an ID before running its handler', async () => {
    const queue = await start([FirstHandler]);
    const job = new Job(queue, 'first-test-job', {});

    await expect(application!.get(TransactionalJobDispatcher).process(job)).rejects.toThrow(
      'Cannot dispatch a job without an ID',
    );

    expect(received.first).toEqual([]);
  });

  it('reports a handler error once and retries the job', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
    const queue = await start([FlakyHandler]);
    const job = await settle(queue, 'flaky-test-job', {}, { attempts: 2 });
    expect(await job.getState()).toBe('completed');
    expect(job.attemptsMade).toBe(2);
    expect(flakyCalls).toBe(2);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ errorClass: 'Error' }), job.id);
    expect(JSON.stringify(report.mock.calls)).not.toContain('private-first-attempt');
  });

  it('reports the code of an AppError a handler throws', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
    const queue = await start([ParkedHandler]);
    const job = await settle(queue, 'parked-test-job', {});
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'OUTBOX_EVENTS_PARKED' }),
      job.id,
    );
  });

  it('refuses to start when two handlers claim the same queue and name', async () => {
    await expect(start([FirstHandler, DuplicateFirstHandler])).rejects.toThrow(
      'Two handlers claim job first-test-job on queue transactional',
    );
  });
});
