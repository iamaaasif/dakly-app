import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { MINUTE_MS } from '../platform/time';
import { ConversationReturnsModule } from './conversation-returns.module';
import { InboxService } from './inbox.service';
import { QueueConversationReturnsJob } from './jobs/queue-conversation-returns.job';
import { ReturnConversationToAiJob } from './jobs/return-conversation-to-ai.job';

const f = new OwnerIsolationFixture();
let app: INestApplicationContext;
let queue: Queue;
const now = new Date();

beforeAll(async () => {
  await f.setup();
  await f.connection.pool.query(
    "update stores set extensions = array['chats'] where id = any($1::uuid[])",
    [[f.a, f.b]],
  );
  class TestModule {}
  Module({
    imports: [
      DatabaseModule,
      BullModule.forRoot({
        connection: toRedisConnection(loadEnv().REDIS_URL),
        prefix: `chat-returns-test-${f.a}`,
      }),
      ConversationReturnsModule,
    ],
  })(TestModule);
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  queue = app.get(getQueueToken(QUEUES.sync));
  vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
});

afterAll(async () => {
  try {
    await queue?.obliterate({ force: true });
    await app?.close();
    await f.connection.pool.query('delete from conversations where store_id = any($1::uuid[])', [
      [f.a, f.b],
    ]);
  } finally {
    vi.restoreAllMocks();
    await f.close();
  }
});

async function timedConversation(storeId: string, assigneeUserId: string, deadline: Date) {
  const contactId = randomUUID();
  const connectionId = randomUUID();
  const id = randomUUID();
  await f.connection.pool.query(
    "insert into contacts (id, store_id, source, kind) values ($1, $2, 'messenger', 'chat_only')",
    [contactId, storeId],
  );
  await f.connection.pool.query(
    `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
     values ($1::uuid, $2, 'facebook_page', $1::text, 'Timer fixture')`,
    [connectionId, storeId],
  );
  await f.connection.pool.query(
    `insert into conversations (id, store_id, contact_id, channel_connection_id, channel,
       status, responder, ai_resumes_at, assignee_user_id)
     values ($1, $2, $3, $4, 'messenger', 'needs_you', 'human', $5, $6)`,
    [id, storeId, contactId, connectionId, deadline, assigneeUserId],
  );
  return id;
}

it('returns a due chat once and keeps a staff extension in force', async () => {
  const past = new Date(now.getTime() - MINUTE_MS);
  const future = new Date(now.getTime() + MINUTE_MS);
  const due = await timedConversation(f.a, f.userA, past);
  const extended = await timedConversation(f.b, f.userB, past);
  const pending = await timedConversation(f.b, f.userB, future);
  const sweep = app.get(QueueConversationReturnsJob);
  await sweep.handle({});
  await sweep.handle({});
  const ids = [due, extended, pending];
  const waiting = (await queue.getWaiting()).filter(({ data }) =>
    ids.includes(data.conversationId),
  );
  expect(waiting.map(({ data }) => data)).toEqual(
    expect.arrayContaining([
      { storeId: f.a, conversationId: due },
      { storeId: f.b, conversationId: extended },
    ]),
  );
  expect(waiting).toHaveLength(2);

  await app.get(InboxService).setResponder(
    f.b,
    extended,
    { kind: 'user', userId: f.userB },
    {
      responder: 'human',
      returnAfterMinutes: 60,
    },
  );
  const handler = app.get(ReturnConversationToAiJob);
  await handler.handle({ storeId: f.b, conversationId: due });
  expect(await f.row('conversations', due)).toMatchObject({ responder: 'human', version: 0 });
  for (const job of waiting) {
    await handler.handle(job.data);
    await handler.handle(job.data);
  }
  expect(await f.row('conversations', due)).toMatchObject({
    responder: 'ai',
    ai_resumes_at: null,
    version: 0,
    status: 'needs_you',
    assignee_user_id: f.userA,
  });
  expect(await f.row('conversations', extended)).toMatchObject({
    responder: 'human',
    version: 1,
  });
  expect(await f.row('conversations', pending)).toMatchObject({
    responder: 'human',
    version: 0,
  });
  const { rows } = await f.connection.pool.query(
    'select actor_type, "after" from audit_log where store_id = $1 and entity_id = $2',
    [f.a, due],
  );
  expect(rows).toEqual([
    { actor_type: 'system', after: { changedFields: ['responder', 'aiResumesAt'] } },
  ]);
});

it('keeps a deadline when Chats is disabled after a return was queued', async () => {
  const past = new Date(now.getTime() - MINUTE_MS);
  const due = await timedConversation(f.a, f.userA, past);
  const sweep = app.get(QueueConversationReturnsJob);
  await sweep.handle({});
  const queued = (await queue.getWaiting()).find(({ data }) => data.conversationId === due);
  expect(queued?.data).toEqual({ storeId: f.a, conversationId: due });
  const before = await f.row('conversations', due);
  const { pool } = f.connection;
  const connection = await pool.connect();
  const handler = app.get(ReturnConversationToAiJob);
  try {
    await connection.query('begin');
    const { rows } = await connection.query<{ pid: number }>('select pg_backend_pid() as pid');
    await connection.query('update stores set extensions = array[]::text[] where id = $1', [f.a]);
    const attempted = handler.handle(queued!.data);
    try {
      await vi.waitFor(async () => {
        const { rows: blocked } = await pool.query<{ blocked: boolean }>(
          'select exists(select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))) as blocked',
          [rows[0]!.pid],
        );
        expect(blocked[0]?.blocked).toBe(true);
      });
    } finally {
      await connection.query('commit');
      await attempted;
    }
    expect(await f.row('conversations', due)).toMatchObject({
      responder: 'human',
      ai_resumes_at: before.ai_resumes_at,
    });
    await queued!.remove();
    await sweep.handle({});
    expect((await queue.getWaiting()).some(({ data }) => data.conversationId === due)).toBe(false);
  } finally {
    connection.release(true);
    await pool.query("update stores set extensions = array['chats'] where id = $1", [f.a]);
  }
  await sweep.handle({});
  const resumed = (await queue.getWaiting()).find(({ data }) => data.conversationId === due);
  expect(resumed?.data).toEqual({ storeId: f.a, conversationId: due });
  await handler.handle(resumed!.data);
  expect(await f.row('conversations', due)).toMatchObject({ responder: 'ai', ai_resumes_at: null });
});
