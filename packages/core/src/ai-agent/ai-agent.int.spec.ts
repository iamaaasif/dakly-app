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
import { KillSwitchesService } from '../kill-switches/kill-switches.service';
import { InboxService } from '../messaging/inbox.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
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
      'product_variants',
      'products',
      'delivery_zones',
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

async function shop(allowance = 1, autoReply = true, isLive = true) {
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
    "insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at, is_ai_live) values ($1::uuid, $2, 'facebook_page', $1::text, 'AI reply test', now() - interval '2 days', $3)",
    [connectionId, storeId, isLive],
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
    attachments: [],
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
    'select tier, purpose, prompt_version from ai_runs where store_id = $1 order by created_at, id',
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
  expect(previous?.delay).toBe(3000);
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
    { earlier_messages: [], customer_messages: ['bhai, order ta', 'kapor chera ashche'] },
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
    runs: [{ tier: 'fast', purpose: 'classify', prompt_version: 'classify-chat.v2' }],
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

it('hands a chat to people without calling the model while staff pause AI replies', async () => {
  const active = await shop();
  const staffId = randomUUID();
  await admin.pool.query(
    'insert into staff_users(id,name,email,role,access_subject,enrolled_at) values($1::uuid,$2,$3,$4,$1::uuid::text,now())',
    [staffId, 'Karim', `${staffId}@example.test`, 'ops'],
  );
  await admin.pool.query(
    "insert into kill_switches(id,feature,reason,paused_by_staff_id) values(gen_random_uuid(),'ai_replies','Model answering wrong prices',$1)",
    [staffId],
  );
  // The switch is cached for 30 seconds; move the clock past it so this read sees the new row.
  const realNow = Clock.prototype.now;
  vi.spyOn(Clock.prototype, 'now').mockImplementation(function (this: Clock) {
    return new Date(realNow.call(this).getTime() + 60_000);
  });
  try {
    const message = await receive(active, 'Hello');
    await agent.reply(active.storeId, message.conversation_id, message.id);
    expect(await observe(active)).toMatchObject({
      conversations: [{ status: 'needs_you', responder: 'human', handover_reason: 'ai_paused' }],
      runs: [],
      usage: [],
    });
  } finally {
    await admin.pool.query('delete from kill_switches where paused_by_staff_id = $1', [staffId]);
    await admin.pool.query('delete from staff_users where id = $1', [staffId]);
    // Load the empty table into the cache now, so later tests do not see the cached pause.
    vi.mocked(Clock.prototype.now).mockImplementation(function (this: Clock) {
      return new Date(realNow.call(this).getTime() + 120_000);
    });
    await app.get(KillSwitchesService).isPaused('ai_replies', active.storeId);
  }
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

it('answers after a routine classification', async () => {
  const active = await shop();
  const message = await receive(active, 'Hello');
  scriptSequence(
    { ...classified, output: classification },
    replyText('Assalamu alaikum, ki lagbe?'),
  );
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'open', responder: 'ai', handover_reason: null }],
    replies: [
      {
        body: 'Assalamu alaikum, ki lagbe?',
        author_type: 'ai',
        recipient_identity_id: message.sender_identity_id,
      },
    ],
    // The one-unit plan reaches its 80 and 100 percent usage thresholds.
    notices: [{ type: 'usage.threshold_reached' }, { type: 'usage.threshold_reached' }],
    usage: [{ id: expect.any(String) }],
    runs: [
      { tier: 'fast', purpose: 'classify' },
      // The customer's words are searched in the catalogue before the model answers.
      { tier: 'embed', purpose: 'embedding' },
      { tier: 'reply', purpose: 'chat_reply' },
    ],
  });
});

it('classifies the words of a voice note together with the message text', async () => {
  const active = await shop();
  const message = await receive(active, 'দাম কত?');
  await admin.pool.query('update messages set media_text = $2 where id = $1', [
    message.id,
    'Voice note: ei saree ta ki stock e ache?',
  ]);
  const inputs = scriptSequence(classified, replyText('জি, আছে।'));

  await agent.reply(active.storeId, message.conversation_id, message.id);

  expect(JSON.parse(inputs[0]!)).toEqual({
    earlier_messages: [],
    customer_messages: ['দাম কত?', 'Voice note: ei saree ta ki stock e ache?'],
  });
});

it('waits for a voice note that is still being read instead of answering without it', async () => {
  const active = await shop();
  const message = await receive(active, 'দাম কত?');
  await admin.pool.query('update messages set attachments = $2 where id = $1', [
    message.id,
    JSON.stringify([
      { kind: 'voice', status: 'stored', objectKey: 'k', contentType: 'audio/ogg', sizeBytes: 3 },
    ]),
  ]);
  const inputs = script(classification);

  const result = await agent.reply(active.storeId, message.conversation_id, message.id);

  expect(result).toEqual({ delayUntil: expect.any(Number) });
  expect(inputs).toEqual([]);
  expect((await observe(active)).replies).toEqual([]);
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

const usage = { inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 };
const toolCalls = (...calls: [string, object][]): LlmResult => ({
  kind: 'tool_calls',
  toolCalls: calls.map(([name, args], index) => ({
    id: `call-${index}`,
    name,
    argumentsJson: JSON.stringify(args),
  })),
  usage,
  responseId: 'fake-tools',
  model: 'gpt-6.1-terra',
});
const replyText = (reply: string): LlmResult => ({
  kind: 'output',
  output: { reply },
  usage,
  responseId: 'fake-reply',
  model: 'gpt-6.1-terra',
});
const classified: LlmResult = {
  kind: 'output',
  output: { ...classification, intent: 'price' },
  usage,
  responseId: 'fake-classification',
  model: 'gpt-6-luna',
};

function scriptSequence(...responses: LlmResult[]) {
  const driver = new FakeLlmDriver(responses);
  const inputs: string[] = [];
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockImplementation(async (request) => {
    inputs.push(request.input);
    return fakeRespond.call(driver, request);
  });
  return inputs;
}

async function sellingShop(allowance = 1) {
  const active = await shop(allowance);
  await admin.pool.query("update stores set phone = '01712345678' where id = $1", [active.storeId]);
  const productId = randomUUID();
  await admin.pool.query(
    "insert into products (id, store_id, name, price_poisha) values ($1, $2, 'কটন পাঞ্জাবি', 120000)",
    [productId, active.storeId],
  );
  await admin.pool.query(
    "insert into product_variants (id, store_id, product_id, title, on_hand, reserved, is_default) values (gen_random_uuid(), $1, $2, 'Default', 10, 2, true)",
    [active.storeId, productId],
  );
  await admin.pool.query(
    "insert into delivery_zones (id, store_id, name, charge_poisha, bd_area_ids, is_default) values (gen_random_uuid(), $1, 'Inside Dhaka', 6000, '{301}', false), (gen_random_uuid(), $1, 'Outside Dhaka', 12000, '{}', true)",
    [active.storeId],
  );
  return { ...active, productId };
}

async function sent({ storeId }: Shop) {
  const { rows } = await admin.pool.query(
    "select body, author_type, ai_run_id, ai_sources from messages where store_id = $1 and direction = 'out' order by created_at, id",
    [storeId],
  );
  return rows;
}

it('answers price and delivery from tool results, saves the run and sources, and spends one unit', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'price koto? Mirpur e delivery charge koto?');
  const inputs = scriptSequence(
    classified,
    toolCalls(
      ['search_products', { query: 'পাঞ্জাবি' }],
      ['get_delivery_charge', { area: 'Dhaka' }],
    ),
    replyText('পাঞ্জাবির দাম ৳1,200 (8 pcs stock e ache). Dhaka city te delivery ৳60.'),
  );
  await agent.reply(active.storeId, message.conversation_id, message.id);

  const replies = await sent(active);
  expect(replies).toEqual([
    {
      body: 'পাঞ্জাবির দাম ৳1,200 (8 pcs stock e ache). Dhaka city te delivery ৳60.',
      author_type: 'ai',
      ai_run_id: expect.any(String),
      ai_sources: [{ tool: 'search_products', refs: [active.productId] }],
    },
  ]);
  expect(inputs[2]).toContain('<tool_results untrusted="true" round="1">');
  expect(inputs[1]).toContain('<conversation untrusted="true">');
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'open', responder: 'ai', handover_reason: null }],
    runs: [
      { purpose: 'classify' },
      { purpose: 'embedding' },
      { purpose: 'chat_reply', prompt_version: 'chat-reply.v13' },
      { purpose: 'embedding' },
      { purpose: 'chat_reply', prompt_version: 'chat-reply.v13' },
    ],
    usage: [{ id: expect.any(String) }],
  });
});

it('writes a reply again after a failed fact check and sends the fixed one', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'price koto?');
  const inputs = scriptSequence(
    classified,
    toolCalls(['search_products', { query: 'পাঞ্জাবি' }]),
    replyText('দাম ৳999 only'),
    toolCalls(['search_products', { query: 'পাঞ্জাবি' }]),
    replyText('পাঞ্জাবির দাম ৳1,200।'),
  );
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect((await sent(active)).map((row) => row.body)).toEqual(['পাঞ্জাবির দাম ৳1,200।']);
  expect(inputs[3]).toContain('<fact_check_failed kind="amount">');
  expect(await runOutcomes(active)).toEqual([
    { outcome: 'completed', error_code: null },
    { outcome: 'failed_check', error_code: 'amount' },
    { outcome: 'completed', error_code: null },
    { outcome: 'sent', error_code: null },
  ]);
});

it('hands over instead of sending a price no tool returned, after one retry', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'price koto?');
  scriptSequence(
    classified,
    toolCalls(['search_products', { query: 'পাঞ্জাবি' }]),
    replyText('দাম ৳999 only'),
    replyText('দাম ৳998 only'),
  );
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect((await sent(active)).map((row) => row.author_type)).toEqual(['system']);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'needs_you', responder: 'human', handover_reason: 'out_of_scope' }],
    usage: [],
  });
});

it('sends a product card before the reply', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'panjabi dekhan');
  scriptSequence(
    classified,
    toolCalls([
      'send_product_card',
      { productId: active.productId, variantId: null, photoId: null, withoutPhoto: null },
    ]),
    replyText('Eta dekhun, ৳1,200.'),
  );
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect((await sent(active)).map((row) => row.body)).toEqual([
    'কটন পাঞ্জাবি\nDefault: ৳1,200',
    'Eta dekhun, ৳1,200.',
  ]);
});

it('remembers the carded product, so a later "L size ache?" reads it again', async () => {
  const active = await sellingShop();
  const first = await receive(active, 'panjabi dekhan');
  // An earlier turn, well before the next one, so the new burst holds only the follow-up.
  await admin.pool.query(
    "update messages set created_at = created_at - interval '10 minutes' where id = $1",
    [first.id],
  );
  scriptSequence(
    classified,
    toolCalls([
      'send_product_card',
      { productId: active.productId, variantId: null, photoId: null, withoutPhoto: null },
    ]),
    replyText('Eta dekhun, ৳1,200.'),
  );
  await agent.reply(active.storeId, first.conversation_id, first.id);
  vi.restoreAllMocks();
  const second = await receive(active, 'L size ache?');
  const inputs = scriptSequence(classified, replyText('জি, ৳1,200, 8 pcs ache.'));

  await agent.reply(active.storeId, second.conversation_id, second.id);

  expect(JSON.parse(inputs[0]!)).toEqual({
    earlier_messages: [
      { from: 'customer', text: 'panjabi dekhan' },
      { from: 'shop', text: 'কটন পাঞ্জাবি\nDefault: ৳1,200' },
      { from: 'shop', text: 'Eta dekhun, ৳1,200.' },
    ],
    customer_messages: ['L size ache?'],
  });
  expect(inputs[1]).toMatch(
    new RegExp(`<products_in_this_chat>.*"productId":"${active.productId}".*"stock":8`),
  );
  expect((await sent(active)).map((row) => row.body)).toEqual([
    'কটন পাঞ্জাবি\nDefault: ৳1,200',
    'Eta dekhun, ৳1,200.',
    'জি, ৳1,200, 8 pcs ache.',
  ]);
});

it('hands a discount ask to a person before any model call in a shop that hands over discounts', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'kurti last price koto?');
  const inputs = scriptSequence();
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(inputs).toEqual([]);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'needs_you', handover_reason: 'discount' }],
  });
});

it('holds the price on a first discount ask and hands over a repeat ask in a shop that keeps its price', async () => {
  const active = await sellingShop();
  await admin.pool.query(
    `update ai_agent_settings set handover_rules = '{"discounts": false}' where store_id = $1`,
    [active.storeId],
  );
  const first = await receive(active, 'panjabi te ektu ছাড় hobe? last price koto?');
  const fixedPrice = 'দুঃখিত, ছাড় নেই, পাঞ্জাবির দাম ৳1,200 ফিক্সড। কোন সাইজ লাগবে?';
  scriptSequence(
    { ...classified, output: { ...classification, intent: 'price', handover: 'discount' } },
    toolCalls(['search_products', { query: 'পাঞ্জাবি' }]),
    replyText(fixedPrice),
  );
  await agent.reply(active.storeId, first.conversation_id, first.id);
  expect((await sent(active)).map((row) => row.body)).toEqual([fixedPrice]);
  await admin.pool.query(
    "update messages set created_at = now() - interval '10 minutes' where store_id = $1",
    [active.storeId],
  );

  const second = await receive(active, 'ar ektu kom hobe na apu?');
  const inputs = scriptSequence();
  await agent.reply(active.storeId, second.conversation_id, second.id);
  expect(inputs).toEqual([]);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'needs_you', responder: 'human', handover_reason: 'discount' }],
  });
});

it('hands over when the model calls hand_over', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'amar order ta ferot dite chai');
  scriptSequence(classified, toolCalls(['hand_over', { reason: 'refund' }]));
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'needs_you', responder: 'human', handover_reason: 'refund' }],
    usage: [],
  });
});

it('hands over when the model keeps calling tools past four rounds', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'price koto?');
  scriptSequence(classified, ...Array.from({ length: 4 }, () => toolCalls(['get_my_orders', {}])));
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await observe(active)).toMatchObject({
    conversations: [{ status: 'needs_you', handover_reason: 'out_of_scope' }],
  });
});

it('sends nothing when staff take over while the model is working', async () => {
  const active = await sellingShop();
  const message = await receive(active, 'price koto?');
  const driver = new FakeLlmDriver([classified, replyText('Ji bolun')]);
  let calls = 0;
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockImplementation(async (request) => {
    calls += 1;
    if (calls === 2)
      await app
        .get(InboxService)
        .setResponder(
          active.storeId,
          message.conversation_id,
          { kind: 'user', userId: active.owner },
          { responder: 'human' },
        );
    return fakeRespond.call(driver, request);
  });
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await sent(active)).toEqual([]);
  expect(await observe(active)).toMatchObject({ usage: [] });
});

it('sends once when the job is retried and finishes a paid window after the allowance is used', async () => {
  const active = await sellingShop();
  const first = await receive(active, 'price koto?');
  scriptSequence(classified, replyText('Ji bolun'), classified, replyText('Ji bolun'));
  await agent.reply(active.storeId, first.conversation_id, first.id);
  await agent.reply(active.storeId, first.conversation_id, first.id);
  expect(await sent(active)).toHaveLength(1);

  const second = await receive(active, 'ar ekta kotha');
  scriptSequence(classified, replyText('Bolun'));
  await agent.reply(active.storeId, second.conversation_id, second.id);
  expect((await sent(active)).map((row) => row.author_type)).toEqual(['ai', 'ai']);
  expect(await observe(active)).toMatchObject({ usage: [{ id: expect.any(String) }] });
});

it('answers nobody but testers while the channel is in practice', async () => {
  const practice = await shop(1, true, false);
  const stranger = await receive(practice, 'Hello', 'stranger');
  const tester = await receive(practice, 'Hello', 'tester');
  const { rows } = await admin.pool.query<{ contact_id: string }>(
    'select contact_id from conversations where store_id = $1 and id = $2',
    [practice.storeId, tester.conversation_id],
  );
  await admin.pool.query('update ai_agent_settings set testers = $2 where store_id = $1', [
    practice.storeId,
    JSON.stringify([rows[0]!.contact_id]),
  ]);

  await agent.reply(practice.storeId, stranger.conversation_id, stranger.id);
  expect(await observe(practice)).toMatchObject({ replies: [], notices: [], runs: [], usage: [] });

  scriptSequence({ ...classified, output: classification }, replyText('Ji bolun'));
  await agent.reply(practice.storeId, tester.conversation_id, tester.id);
  expect((await observe(practice)).replies).toMatchObject([
    { body: 'Ji bolun', author_type: 'ai' },
  ]);
});

async function runOutcomes({ storeId }: Shop) {
  const { rows } = await admin.pool.query(
    "select outcome, error_code from ai_runs where store_id = $1 and purpose = 'chat_reply' order by created_at, id",
    [storeId],
  );
  return rows;
}

async function conversationTimer({ storeId }: Shop) {
  const { rows } = await admin.pool.query<{ responder: string; minutes: number | null }>(
    'select responder, extract(epoch from ai_resumes_at - now()) / 60 as minutes from conversations where store_id = $1',
    [storeId],
  );
  return {
    responder: rows[0]!.responder,
    minutes: rows[0]!.minutes && Math.round(rows[0]!.minutes),
  };
}

it("counts the return timer from the person's reply when the job runs late", async () => {
  const late = await shop();
  const first = await receive(late, 'Hello');
  const replyId = await staffReply(late, first.conversation_id, first.sender_identity_id);
  await admin.pool.query(
    "update messages set created_at = now() - interval '20 minutes' where id = $1",
    [replyId],
  );
  await agent.restartReturnAfterStaffReply(late.storeId, replyId);
  expect(await conversationTimer(late)).toEqual({ responder: 'human', minutes: 10 });
});

it('records the fact check failure on the AI run and marks a sent reply', async () => {
  const blocked = await sellingShop();
  const first = await receive(blocked, 'price koto?');
  scriptSequence(classified, replyText('দাম ৳999 only'), replyText('দাম ৳999 only'));
  await agent.reply(blocked.storeId, first.conversation_id, first.id);
  expect(await runOutcomes(blocked)).toEqual([
    { outcome: 'failed_check', error_code: 'amount' },
    { outcome: 'failed_check', error_code: 'amount' },
  ]);

  const open = await sellingShop();
  const second = await receive(open, 'hello');
  scriptSequence(classified, replyText('Ji bolun'));
  await agent.reply(open.storeId, second.conversation_id, second.id);
  expect(await runOutcomes(open)).toEqual([{ outcome: 'sent', error_code: null }]);
});

it('returns an unclaimed hand-over to the AI after the claim timer and keeps a claimed chat with the person', async () => {
  const unclaimed = await shop();
  const message = await receive(unclaimed, 'Please get a person');
  script({ ...classification, asksForPerson: true });
  await agent.reply(unclaimed.storeId, message.conversation_id, message.id);
  expect(await conversationTimer(unclaimed)).toEqual({ responder: 'human', minutes: 10 });
  await admin.pool.query(
    "update conversations set ai_resumes_at = now() - interval '1 minute' where store_id = $1",
    [unclaimed.storeId],
  );
  await app
    .get(InboxService)
    .returnDue(unclaimed.storeId, message.conversation_id, { kind: 'system' });
  expect(await conversationTimer(unclaimed)).toEqual({ responder: 'ai', minutes: null });

  const claimed = await shop();
  const other = await receive(claimed, 'Please get a person');
  script({ ...classification, asksForPerson: true });
  await agent.reply(claimed.storeId, other.conversation_id, other.id);
  await app
    .get(InboxService)
    .setResponder(
      claimed.storeId,
      other.conversation_id,
      { kind: 'user', userId: claimed.owner },
      { responder: 'human' },
    );
  expect(await conversationTimer(claimed)).toEqual({ responder: 'human', minutes: null });
});

it('keeps a hand-over with people when the store switched the claim timer off', async () => {
  const active = await shop();
  await admin.pool.query(
    'update ai_agent_settings set claim_timeout_minutes = null where store_id = $1',
    [active.storeId],
  );
  const message = await receive(active, 'Please get a person');
  script({ ...classification, asksForPerson: true });
  await agent.reply(active.storeId, message.conversation_id, message.id);
  expect(await conversationTimer(active)).toEqual({ responder: 'human', minutes: null });
});

async function staffReply(active: Shop, conversationId: string, senderIdentityId: string) {
  await app.get(MessagingService).queueChannelMessage(active.storeId, {
    contactId: (
      await admin.pool.query('select contact_id from conversations where id = $1', [conversationId])
    ).rows[0].contact_id,
    channel: 'messenger',
    connectionId: active.connectionId,
    identityId: senderIdentityId,
    category: 'staff_reply',
    actor: { kind: 'user', userId: active.owner },
    content: 'Ji, ami dekhchi',
    operationKey: randomUUID(),
  });
  const { rows } = await admin.pool.query(
    "select id from messages where store_id = $1 and author_type = 'user'",
    [active.storeId],
  );
  return rows.at(-1).id as string;
}

it("returns the chat to the AI 30 minutes after a person's last reply, without cutting a longer take-over short", async () => {
  const replied = await shop();
  const first = await receive(replied, 'Hello');
  await agent.restartReturnAfterStaffReply(
    replied.storeId,
    await staffReply(replied, first.conversation_id, first.sender_identity_id),
  );
  expect(await conversationTimer(replied)).toEqual({ responder: 'human', minutes: 30 });

  const longer = await shop();
  const second = await receive(longer, 'Hello');
  await app
    .get(InboxService)
    .setResponder(
      longer.storeId,
      second.conversation_id,
      { kind: 'user', userId: longer.owner },
      { responder: 'human', returnAfterMinutes: 360 },
    );
  await agent.restartReturnAfterStaffReply(
    longer.storeId,
    await staffReply(longer, second.conversation_id, second.sender_identity_id),
  );
  expect(await conversationTimer(longer)).toEqual({ responder: 'human', minutes: 360 });

  const permanent = await shop();
  const third = await receive(permanent, 'Hello');
  await app
    .get(InboxService)
    .setResponder(
      permanent.storeId,
      third.conversation_id,
      { kind: 'user', userId: permanent.owner },
      { responder: 'human' },
    );
  await agent.restartReturnAfterStaffReply(
    permanent.storeId,
    await staffReply(permanent, third.conversation_id, third.sender_identity_id),
  );
  expect(await conversationTimer(permanent)).toEqual({ responder: 'human', minutes: null });
});
