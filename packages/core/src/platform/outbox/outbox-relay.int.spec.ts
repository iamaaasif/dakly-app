import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';
import { createDatabase } from '@dakly/db/client';

import { loadEnv } from '../config/env';
import { DatabaseModule } from '../database/database.module';
import { StoreTransaction } from '../database/store-transaction';
import { ErrorReportingModule } from '../logging/error-reporting.module';
import { BulkJobDispatcher, TransactionalJobDispatcher } from '../queue/job-dispatcher';
import type { JobHandler } from '../queue/job-handler';
import { QUEUES } from '../queue/queues';
import { toRedisConnection } from '../queue/redis-connection';
import { HandlesEvent } from './handles-event';
import { OutboxRelayModule } from './outbox-relay.module';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxModule } from './outbox.module';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

type Handled = { subscriber: string; contactId: string };
const handled: Handled[] = [];
let workflowFailuresLeft = 0;

function contactIdOf(data: unknown) {
  return (data as { payload: { contactId: string } }).payload.contactId;
}

// Bulk runs one job at a time, so this subscriber sees events in the order they were queued.
class RefreshContactStats implements JobHandler {
  async handle(data: unknown) {
    handled.push({ subscriber: 'RefreshContactStats', contactId: contactIdOf(data) });
  }
}
HandlesEvent('contact.created', { queue: QUEUES.bulk })(RefreshContactStats);

class StartContactWorkflow implements JobHandler {
  async handle(data: unknown) {
    if (workflowFailuresLeft > 0) {
      workflowFailuresLeft -= 1;
      throw new Error('Workflow store unavailable');
    }
    handled.push({ subscriber: 'StartContactWorkflow', contactId: contactIdOf(data) });
  }
}
HandlesEvent('contact.created', { queue: QUEUES.transactional })(StartContactWorkflow);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
let application: INestApplicationContext;
let outbox: OutboxService;
let relay: OutboxRelayService;
let storeTransaction: StoreTransaction;
let queues: Queue[];

function contactCreated(storeId: string): DaklyEvent {
  return {
    type: 'contact.created',
    storeId,
    occurredAt: new Date().toISOString(),
    payload: { contactId: randomUUID() },
  };
}

async function publishCommitted() {
  const storeId = randomUUID();
  storeIds.push(storeId);
  const event = contactCreated(storeId);
  await storeTransaction.run(storeId, () => outbox.publish(storeId, event));
  return { storeId, contactId: contactIdOf(event) };
}

async function until(condition: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await setTimeout(25);
  }
  throw new Error('Condition not reached');
}

async function jobsFor(contactId: string) {
  const jobs = await Promise.all(
    queues.map((queue) =>
      queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed', 'prioritized']),
    ),
  );
  return jobs.flat().filter((job) => contactIdOf(job.data) === contactId);
}

function handledBy(contactId: string) {
  return handled
    .filter((entry) => entry.contactId === contactId)
    .map((entry) => entry.subscriber)
    .sort();
}

async function outboxRow(contactId: string) {
  const { rows } = await admin.pool.query<{ attempts: number; isPublished: boolean }>(
    `select attempts, published_at is not null as "isPublished"
     from outbox_events where payload->>'contactId'=$1`,
    [contactId],
  );
  return rows;
}

// Lets a claimed row be claimed again without waiting for its one-minute claim to lapse.
async function expireClaim(contactId: string) {
  await admin.pool.query(
    `update outbox_events set claimed_at=now()-interval '2 minutes' where payload->>'contactId'=$1`,
    [contactId],
  );
}

beforeAll(async () => {
  class TestModule {}
  Module({
    imports: [
      DiscoveryModule,
      DatabaseModule,
      ErrorReportingModule,
      OutboxModule,
      OutboxRelayModule,
      BullModule.forRoot({
        connection: toRedisConnection(loadEnv().REDIS_URL),
        prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
      }),
      BullModule.registerQueue({ name: QUEUES.transactional }),
      BullModule.registerQueue({ name: QUEUES.bulk }),
    ],
    providers: [
      RefreshContactStats,
      StartContactWorkflow,
      TransactionalJobDispatcher,
      BulkJobDispatcher,
    ],
  })(TestModule);
  application = await NestFactory.createApplicationContext(TestModule, { logger: false });
  outbox = application.get(OutboxService);
  relay = application.get(OutboxRelayService);
  storeTransaction = application.get(StoreTransaction);
  queues = [
    application.get<Queue>(getQueueToken(QUEUES.transactional)),
    application.get<Queue>(getQueueToken(QUEUES.bulk)),
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
  workflowFailuresLeft = 0;
});

afterAll(async () => {
  await application.close();
  await admin.pool.query('delete from outbox_events where store_id = any($1::uuid[])', [storeIds]);
  await admin.pool.end();
});

describe('OutboxRelayService', () => {
  it('never relays an event published in a rolled-back store transaction', async () => {
    const storeId = randomUUID();
    storeIds.push(storeId);
    const event = contactCreated(storeId);
    await expect(
      storeTransaction.run(storeId, async () => {
        await outbox.publish(storeId, event);
        throw new Error('Contact save failed');
      }),
    ).rejects.toThrow('Contact save failed');
    const committed = await publishCommitted();

    await relay.relay();

    await until(async () => handledBy(committed.contactId).length === 2);
    expect(await outboxRow(contactIdOf(event))).toEqual([]);
    expect(await jobsFor(contactIdOf(event))).toEqual([]);
  });

  it('rejects an event published outside a store transaction', async () => {
    const storeId = randomUUID();
    await expect(outbox.publish(storeId, contactCreated(storeId))).rejects.toMatchObject({
      code: 'STORE_TRANSACTION_REQUIRED',
    });
  });

  it('rejects an event for another store than the open transaction', async () => {
    const storeId = randomUUID();
    const event = contactCreated(randomUUID());
    await expect(
      storeTransaction.run(storeId, () => outbox.publish(storeId, event)),
    ).rejects.toMatchObject({ code: 'EVENT_STORE_MISMATCH' });
    expect(await outboxRow(contactIdOf(event))).toEqual([]);
  });

  it('queues each subscriber job once when two relays run at the same time', async () => {
    const events = [await publishCommitted(), await publishCommitted(), await publishCommitted()];
    // Both relays reach the claim before either runs it.
    const claim = OutboxRepository.prototype.claim;
    let claims = 0;
    let bothClaiming!: () => void;
    const overlap = new Promise<void>((resolve) => (bothClaiming = resolve));
    vi.spyOn(OutboxRepository.prototype, 'claim').mockImplementation(async function (
      this: OutboxRepository,
      limit,
    ) {
      if (++claims === 2) bothClaiming();
      await overlap;
      return claim.call(this, limit);
    });

    await Promise.all([relay.relay(), relay.relay()]);

    for (const { contactId } of events) {
      await until(() => handledBy(contactId).length === 2);
      expect((await jobsFor(contactId)).length).toBe(2);
      expect(await outboxRow(contactId)).toEqual([{ attempts: 1, isPublished: true }]);
    }
    await setTimeout(200);
    for (const { contactId } of events)
      expect(handledBy(contactId)).toEqual(['RefreshContactStats', 'StartContactWorkflow']);
  });

  it('queues no duplicate when a relay stopped after queueing and before marking', async () => {
    const { contactId } = await publishCommitted();
    vi.spyOn(OutboxRepository.prototype, 'markPublished').mockRejectedValueOnce(
      new Error('Connection lost'),
    );

    await expect(relay.relay()).rejects.toThrow('Connection lost');
    await until(() => handledBy(contactId).length === 2);
    expect(await outboxRow(contactId)).toEqual([{ attempts: 1, isPublished: false }]);
    await expireClaim(contactId);
    await relay.relay();

    expect(await outboxRow(contactId)).toEqual([{ attempts: 2, isPublished: true }]);
    await setTimeout(200);
    expect((await jobsFor(contactId)).length).toBe(2);
    expect(handledBy(contactId)).toEqual(['RefreshContactStats', 'StartContactWorkflow']);
  });

  it('retries a failing subscriber without affecting another subscriber of the event', async () => {
    workflowFailuresLeft = 1;
    const { contactId } = await publishCommitted();

    await relay.relay();

    await until(() => handledBy(contactId).includes('RefreshContactStats'));
    const workflowJob = async () =>
      (await jobsFor(contactId)).find((job) => job.name === 'StartContactWorkflow')!;
    await until(async () => (await (await workflowJob()).getState()) === 'delayed');
    expect(handledBy(contactId)).toEqual(['RefreshContactStats']);
    await (await workflowJob()).promote();
    await until(() => handledBy(contactId).length === 2);
    expect(handledBy(contactId)).toEqual(['RefreshContactStats', 'StartContactWorkflow']);
    expect((await workflowJob()).attemptsMade).toBe(2);
  });

  it('delivers events from one store to a bulk subscriber in the order they were published', async () => {
    const storeId = randomUUID();
    storeIds.push(storeId);
    const contactIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const event = contactCreated(storeId);
      await storeTransaction.run(storeId, () => outbox.publish(storeId, event));
      contactIds.push(contactIdOf(event));
      // Ids order by millisecond, so each event gets a later one than the last.
      await setTimeout(2);
    }

    await relay.relay();

    const received = () =>
      handled
        .filter((entry) => entry.subscriber === 'RefreshContactStats')
        .map((entry) => entry.contactId)
        .filter((contactId) => contactIds.includes(contactId));
    await until(() => received().length === 5);
    expect(received()).toEqual(contactIds);
  });

  it('stops claiming a row that failed to relay ten times', async () => {
    const { contactId } = await publishCommitted();
    const addBulk = vi
      .spyOn(Queue.prototype, 'addBulk')
      .mockRejectedValue(new Error('Valkey unavailable'));
    for (let failure = 0; failure < 10; failure += 1) {
      await expect(relay.relay()).rejects.toThrow('Valkey unavailable');
      await expireClaim(contactId);
    }
    addBulk.mockRestore();

    await relay.relay();

    expect(await outboxRow(contactId)).toEqual([{ attempts: 10, isPublished: false }]);
    expect(await jobsFor(contactId)).toEqual([]);
  });
});
