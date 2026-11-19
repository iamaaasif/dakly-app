import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import {
  chatClassificationSchema,
  type ChatClassification,
} from '@dakly/contracts/chat-classification';
import { createDatabase } from '@dakly/db/client';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import type { LlmResult } from '@dakly/providers/llm/llm-driver';

import { AiService } from '../ai/ai.service';
import { InboxService } from '../messaging/inbox.service';
import { MessagingService } from '../messaging/messaging.service';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { AiAgentModule } from './ai-agent.module';
import { AiAgentService } from './ai-agent.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];
const fakeRespond = FakeLlmDriver.prototype.respond;

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    AiAgentModule,
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `agent-int-${randomUUID()}`,
    }),
  ],
})(TestModule);

let app: INestApplicationContext;
let agent: AiAgentService;
let queue: Queue;

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  agent = app.get(AiAgentService);
  queue = app.get(getQueueToken(QUEUES.aiReply));
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  try {
    await queue?.obliterate();
    await app?.close();
    for (const table of [
      'notifications',
      'outbox_events',
      'audit_log',
      'ai_runs',
      'ai_agent_settings',
      'usage_events',
      'subscriptions',
      'memberships',
      'consents',
      'messages',
      'conversations',
      'contact_identities',
      'contacts',
      'channel_connections',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [storeIds]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [storeIds]);
    await admin.pool.query('delete from plans where id = any($1::uuid[])', [planIds]);
    await admin.pool.query('delete from users where id = any($1::uuid[])', [userIds]);
  } finally {
    await admin.pool.end();
  }
});

async function member(storeId: string, role: 'owner' | 'admin') {
  const userId = randomUUID();
  userIds.push(userId);
  await admin.pool.query(
    'insert into users (id, name, phone, phone_verified_at) values ($1, $2, $3, now())',
    [userId, 'Rina', `018${randomInt(10000000, 99999999)}`],
  );
  await admin.pool.query(
    "insert into memberships (id, store_id, user_id, built_in_role, status) values (gen_random_uuid(), $1, $2, $3, 'active')",
    [storeId, userId, role],
  );
  return userId;
}

async function shop(allowance = 1, autoReply = true) {
  const storeId = randomUUID();
  const connectionId = randomUUID();
  const planId = randomUUID();
  storeIds.push(storeId);
  planIds.push(planId);
  await admin.pool.query(
    "insert into stores (id, name, extensions) values ($1, 'AI reply test', '{chats}')",
    [storeId],
  );
  await admin.pool.query(
    'insert into ai_agent_settings (store_id, is_auto_reply_on) values ($1, $2)',
    [storeId, autoReply],
  );
  await admin.pool.query(
    "insert into plans (id, code, name, monthly_price_poisha, yearly_price_poisha, limits, is_public) values ($1::uuid, $1::text, 'Reply fixture', 0, 0, $2, false)",
    [planId, { ai_conversation: allowance }],
  );
  await admin.pool.query(
    "insert into subscriptions (id, store_id, plan_id, status, current_period_price_poisha, current_period_start, current_period_end) values (gen_random_uuid(), $1, $2, 'active', 0, now(), now() + interval '1 month')",
    [storeId, planId],
  );
  await admin.pool.query(
    "insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at) values ($1::uuid, $2, 'facebook_page', $1::text, 'AI reply test', now() - interval '2 days')",
    [connectionId, storeId],
  );
  return { storeId, connectionId, owner: await member(storeId, 'owner') };
}

type Shop = Awaited<ReturnType<typeof shop>>;

async function receive(shop: Shop, content: string, sender = 'customer', at = new Date()) {
  const externalMessageId = randomUUID();
  const outcome = await app.get(MessagingService).receiveInboundMessage(shop.storeId, {
    kind: 'facebook_page',
    externalAccountId: shop.connectionId,
    externalMessageId,
    externalSenderId: sender,
    content,
    sentAt: at,
    receivedAt: new Date(),
  });
  expect(outcome).toBe('stored');
  const { rows } = await admin.pool.query<{
    id: string;
    conversation_id: string;
    sender_identity_id: string;
  }>(
    'select id, conversation_id, sender_identity_id from messages where store_id = $1 and external_id = $2',
    [shop.storeId, externalMessageId],
  );
  return rows[0]!;
}

const classification: ChatClassification = {
  intent: 'greeting',
  language: 'banglish',
  sentiment: 'neutral',
  asksForPerson: false,
  confidence: 'high',
  handover: null,
};

function script(output: ChatClassification, duringCall?: () => Promise<void>, calls = 1) {
  const response: LlmResult = {
    kind: 'output',
    output,
    usage: { inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 },
    responseId: 'fake-classification',
    model: 'gpt-6-luna',
  };
  const driver = new FakeLlmDriver(Array.from({ length: calls }, () => response));
  const inputs: string[] = [];
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockImplementation(async (request) => {
    inputs.push(request.input);
    await duringCall?.();
    return fakeRespond.call(driver, request);
  });
  return inputs;
}

async function observe({ storeId }: Shop) {
  const { rows: conversations } = await admin.pool.query(
    'select status, responder, handover_reason from conversations where store_id = $1',
    [storeId],
  );
  const { rows: replies } = await admin.pool.query(
    "select body, author_type, recipient_identity_id from messages where store_id = $1 and direction = 'out' and kind = 'text'",
    [storeId],
  );
  const { rows: notices } = await admin.pool.query(
    'select user_id, type from notifications where store_id = $1',
    [storeId],
  );
  const { rows: runs } = await admin.pool.query(
    'select tier, purpose, prompt_version from ai_runs where store_id = $1',
    [storeId],
  );
  const { rows: usage } = await admin.pool.query(
    'select id from usage_events where store_id = $1',
    [storeId],
  );
  return { conversations, replies, notices, runs, usage };
}

it('replaces a delayed job for a burst and ignores a reordered event', async () => {
  const active = await shop();
  const first = await receive(active, 'Hello');
  await agent.schedule(active.storeId, first.conversation_id, first.id);
  const previous = await queue.getJob(`ai-reply-${first.id}`);
  expect(previous?.delay).toBe(8000);
  const newest = await receive(active, 'I need a person');
  await agent.schedule(active.storeId, newest.conversation_id, newest.id);
  await agent.schedule(active.storeId, first.conversation_id, first.id);
  expect(await queue.getJob(`ai-reply-${first.id}`)).toBeUndefined();
  const job = await queue.getJob(`ai-reply-${newest.id}`);
  expect(job?.data).toEqual({
    storeId: active.storeId,
    conversationId: newest.conversation_id,
    messageId: newest.id,
  });
  expect(await job?.getState()).toBe('delayed');
});

it('can refresh a burst when two messages share the same receipt time', async () => {
  const active = await shop();
  const first = await receive(active, 'Hello');
  const second = await receive(active, 'Please get a person');
  const [olderId, latestId] = [first.id, second.id].sort();
  await admin.pool.query(
    'update messages set created_at = $1 where store_id = $2 and conversation_id = $3',
    [new Date(), active.storeId, second.conversation_id],
  );
  await agent.schedule(active.storeId, second.conversation_id, olderId);
  expect((await queue.getJob(`ai-reply-${olderId}`))?.data.messageId).toBe(latestId);
});

it('classifies a burst without internal notes and sends one fixed hand-over reply to its sender', async () => {
  const active = await shop();
  const assignee = await member(active.storeId, 'admin');
  const first = await receive(active, 'bhai, order ta');
  await app.get(InboxService).update(active.storeId, first.conversation_id, active.owner, {
    assigneeUserId: assignee,
  });
  await app
    .get(InboxService)
    .addNote(
      active.storeId,
      first.conversation_id,
      { kind: 'user', userId: active.owner },
      { body: 'Internal note must stay private' },
    );
  const message = await receive(active, 'kapor chera ashche');
  const inputs = script(classification);
  await agent.reply(active.storeId, message.conversation_id, message.id);
  await agent.reply(active.storeId, message.conversation_id, message.id);

  expect(inputs.map((input) => JSON.parse(input))).toEqual([
    { customer_messages: ['bhai, order ta', 'kapor chera ashche'] },
  ]);
  const { rows: events } = await admin.pool.query(
    "select payload from outbox_events where store_id = $1 and type = 'conversation.handed_over'",
    [active.storeId],
  );
  expect(events).toEqual([
    { payload: { conversationId: message.conversation_id, reason: 'complaint' } },
  ]);
  expect(await observe(active)).toEqual({
    conversations: [{ status: 'needs_you', responder: 'human', handover_reason: 'complaint' }],
    replies: [
      {
        body: 'একটু অপেক্ষা করুন, আমাদের টিম আপনাকে জানাবে।',
        author_type: 'system',
        recipient_identity_id: message.sender_identity_id,
      },
    ],
    notices: [{ user_id: assignee, type: 'conversation.handed_over' }],
    runs: [{ tier: 'fast', purpose: 'classify', prompt_version: 'classify-chat.v1' }],
    usage: [],
  });
});

it('hands over an exhausted allowance without calling the model or spending a unit', async () => {
  const active = await shop(0);
  const message = await receive(active, 'Hello');
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'needs_you', responder: 'human', handover_reason: 'allowance_used' }],
    notices: [{ user_id: active.owner, type: 'conversation.handed_over' }],
    runs: [],
    usage: [],
  });
});

it('keeps human control when a person takes over during classification', async () => {
  const active = await shop();
  const message = await receive(active, 'Please get a person');
  script({ ...classification, asksForPerson: true }, async () => {
    await app
      .get(InboxService)
      .setResponder(
        active.storeId,
        message.conversation_id,
        { kind: 'user', userId: active.owner },
        { responder: 'human' },
      );
  });
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'open', responder: 'human', handover_reason: null }],
    replies: [],
    notices: [],
    usage: [],
  });
});

it('drops a holding reply when another message arrives during classification with an older provider timestamp', async () => {
  const active = await shop();
  const original = await receive(active, 'Please get a person');
  script({ ...classification, asksForPerson: true }, async () => {
    await receive(active, 'I found the answer', 'customer', new Date(Date.now() - MINUTE_MS));
  });
  await agent.reply(active.storeId, original.conversation_id, original.id);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'open', responder: 'ai', handover_reason: null }],
    replies: [],
    notices: [],
    usage: [],
  });
});

it('stops before classifying when AI is off, the window closes, consent is withdrawn, or the job is cross-store', async () => {
  const off = await shop(1, false);
  const active = await shop();
  const expired = await shop();
  const offMessage = await receive(off, 'Hello');
  const stop = await receive(active, 'STOP');
  const old = await receive(expired, 'Hello', 'customer', new Date(Date.now() - DAY_MS));
  await agent.reply(off.storeId, offMessage.conversation_id, offMessage.id);
  await agent.reply(active.storeId, stop.conversation_id, stop.id);
  await agent.reply(expired.storeId, old.conversation_id, old.id);
  await agent.reply(expired.storeId, stop.conversation_id, stop.id);
  for (const store of [off, active, expired]) {
    expect(await observe(store)).toMatchObject({ replies: [], notices: [], runs: [], usage: [] });
  }
});

it('stops after a routine classification', async () => {
  const active = await shop();
  const message = await receive(active, 'Hello');
  script(classification);
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'open', responder: 'ai', handover_reason: null }],
    replies: [],
    notices: [],
    usage: [],
    runs: [{ tier: 'fast', purpose: 'classify' }],
  });
});

it('delays classification while the store has three model calls running', async () => {
  const active = await shop();
  const message = await receive(active, 'Hello');
  const finish = Promise.withResolvers<void>();
  const inputs = script(classification, () => finish.promise, 3);
  const ai = app.get(AiService);
  const running = Array.from({ length: 3 }, () =>
    ai.run(active.storeId, {
      tier: 'fast',
      purpose: 'classify',
      prompt: { version: 'test-capacity', instructions: 'Classify this test message.' },
      input: 'Hello',
      output: chatClassificationSchema,
    }),
  );
  try {
    await vi.waitFor(() => expect(inputs).toHaveLength(3));
    await expect(agent.reply(active.storeId, message.conversation_id, message.id)).resolves.toEqual(
      {
        delayUntil: expect.any(Number),
      },
    );
    expect(await observe(active)).toMatchObject({ replies: [], notices: [], runs: [] });
  } finally {
    finish.resolve();
    await Promise.all(running);
  }
});
