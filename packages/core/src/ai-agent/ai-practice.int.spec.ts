import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { TestQuestion } from '@dakly/contracts/ai-practice';
import { createDatabase } from '@dakly/db/client';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import type { LlmResult } from '@dakly/providers/llm/llm-driver';

import { KnowledgeSearchService } from '../ai/knowledge-search.service';
import { DatabaseModule } from '../platform/database/database.module';
import { AiPracticeModule } from './ai-practice.module';
import { AiPracticeService } from './ai-practice.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
const userIds: string[] = [];
const fakeRespond = FakeLlmDriver.prototype.respond;
const usage = { inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 };

class TestModule {}
Module({ imports: [DatabaseModule, AiPracticeModule] })(TestModule);

let app: INestApplicationContext;
let practice: AiPracticeService;

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  practice = app.get(AiPracticeService);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'audit_log',
      'ai_runs',
      'ai_agent_settings',
      'usage_events',
      'knowledge_items',
      'messages',
      'conversations',
      'contacts',
      'product_variants',
      'products',
      'channel_connections',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [storeIds]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [storeIds]);
    await admin.pool.query('delete from users where id = any($1::uuid[])', [userIds]);
  } finally {
    await admin.pool.end();
  }
});

const questions: TestQuestion[] = [
  { question: 'price koto?', expectedAnswer: '1,200 taka' },
  { question: 'delivery koto?', expectedAnswer: '60 taka in Dhaka' },
  { question: 'M size ache?', expectedAnswer: 'Yes, M is in stock' },
];

async function shop(options: { knowledge?: boolean; products?: boolean; rules?: boolean } = {}) {
  const { knowledge = true, products = true, rules = true } = options;
  const storeId = randomUUID();
  const connectionId = randomUUID();
  const userId = randomUUID();
  storeIds.push(storeId);
  userIds.push(userId);
  await admin.pool.query(
    "insert into stores (id, name, phone, extensions) values ($1, 'Practice test', '01712345678', '{chats}')",
    [storeId],
  );
  await admin.pool.query(
    'insert into users (id, name, phone, phone_verified_at) values ($1, $2, $3, now())',
    [userId, 'Rina', `018${randomInt(10000000, 99999999)}`],
  );
  await admin.pool.query(
    "insert into channel_connections (id, store_id, kind, external_account_id, display_name) values ($1::uuid, $2, 'facebook_page', $1::text, 'Practice test')",
    [connectionId, storeId],
  );
  await admin.pool.query(
    'insert into ai_agent_settings (store_id, handover_rules, test_questions) values ($1, $2, $3)',
    [storeId, JSON.stringify(rules ? { refund: true } : {}), JSON.stringify(questions)],
  );
  if (knowledge)
    await admin.pool.query(
      "insert into knowledge_items (id, store_id, kind, question, answer, status) values (gen_random_uuid(), $1, 'faq', 'Delivery?', 'Two days', 'active')",
      [storeId],
    );
  if (products) {
    const productId = randomUUID();
    await admin.pool.query(
      "insert into products (id, store_id, name, price_poisha) values ($1, $2, 'কটন পাঞ্জাবি', 120000)",
      [productId, storeId],
    );
    await admin.pool.query(
      "insert into product_variants (id, store_id, product_id, title, on_hand, reserved, is_default) values (gen_random_uuid(), $1, $2, 'Default', 10, 2, true)",
      [storeId, productId],
    );
  }
  return { storeId, connectionId, userId };
}

const output = (value: object, model: string): LlmResult => ({
  kind: 'output',
  output: value,
  usage,
  responseId: 'fake',
  model,
});
const routine = output(
  {
    intent: 'price',
    language: 'banglish',
    sentiment: 'neutral',
    asksForPerson: false,
    confidence: 'high',
    handover: null,
  },
  'gpt-6-luna',
);
const reply = (text: string) => output({ reply: text }, 'gpt-6.1-terra');
const grade = (agrees: boolean) => output({ agrees }, 'gpt-6-luna');

// One classify, one reply and one grade call for each question.
function script(...perQuestion: boolean[]) {
  const responses = perQuestion.flatMap((agrees) => [routine, reply('Ji bolun'), grade(agrees)]);
  const driver = new FakeLlmDriver(responses);
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockImplementation((request) =>
    fakeRespond.call(driver, request),
  );
}

async function sideEffects(storeId: string) {
  const count = async (table: string) =>
    (
      await admin.pool.query<{ n: string }>(`select count(*) n from ${table} where store_id = $1`, [
        storeId,
      ])
    ).rows[0]!.n;
  return {
    messages: await count('messages'),
    conversations: await count('conversations'),
    usage: await count('usage_events'),
  };
}

async function contact(storeId: string) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts (id, store_id, name, phone, kind, source) values ($1, $2, 'Tester', $3, 'customer', 'manual')",
    [id, storeId, `017${randomInt(10000000, 99999999)}`],
  );
  return id;
}

const isLive = async (connectionId: string) =>
  (
    await admin.pool.query<{ is_ai_live: boolean }>(
      'select is_ai_live from channel_connections where id = $1',
      [connectionId],
    )
  ).rows[0]!.is_ai_live;

it('answers a test question without saving a message or spending a unit', async () => {
  const active = await shop();
  script(true);
  expect(await practice.ask(active.storeId, 'price koto?')).toEqual({
    kind: 'reply',
    text: 'Ji bolun',
    source: { kind: 'general' },
  });
  expect(await sideEffects(active.storeId)).toEqual({
    messages: '0',
    conversations: '0',
    usage: '0',
  });
});

// The model asks Knowledge a question, so the reply names what it found.
async function askKnowledge(storeId: string, itemId: string) {
  vi.spyOn(KnowledgeSearchService.prototype, 'search').mockResolvedValue([
    { itemId, content: 'Two days' },
  ]);
  const toolCalls = [
    { id: 'call-1', name: 'search_knowledge', argumentsJson: '{"question":"delivery"}' },
  ];
  const driver = new FakeLlmDriver([
    routine,
    { kind: 'tool_calls', toolCalls, usage, responseId: 'fake', model: 'gpt-6.1-terra' },
    reply('Two days.'),
  ]);
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockImplementation((request) =>
    fakeRespond.call(driver, request),
  );
  return practice.ask(storeId, 'delivery koto din?');
}

const knowledgeItem = async (storeId: string) =>
  (
    await admin.pool.query<{ id: string }>('select id from knowledge_items where store_id = $1', [
      storeId,
    ])
  ).rows[0]!.id;

it('names the answer a reply came from', async () => {
  const active = await shop();
  const itemId = await knowledgeItem(active.storeId);
  expect(await askKnowledge(active.storeId, itemId)).toEqual({
    kind: 'reply',
    text: 'Two days.',
    source: { kind: 'answer', question: 'Delivery?' },
  });
});

it('names the file a reply came from', async () => {
  const active = await shop({ knowledge: false });
  const fileId = randomUUID();
  await admin.pool.query(
    "insert into files (id, store_id, purpose, object_key, file_name, content_type, size_bytes, status) values ($1, $2, 'knowledge_file', $3, 'Size chart.pdf', 'application/pdf', 10, 'ready')",
    [fileId, active.storeId, `stores/${active.storeId}/knowledge/${fileId}`],
  );
  const itemId = randomUUID();
  await admin.pool.query(
    "insert into knowledge_items (id, store_id, kind, file_id, status) values ($1, $2, 'file', $3, 'active')",
    [itemId, active.storeId, fileId],
  );
  expect(await askKnowledge(active.storeId, itemId)).toMatchObject({
    source: { kind: 'file', fileName: 'Size chart.pdf' },
  });
  await admin.pool.query('delete from knowledge_items where id = $1', [itemId]);
  await admin.pool.query('delete from files where id = $1', [fileId]);
});

it('shows a hand-over instead of a reply when the question needs a person', async () => {
  const active = await shop();
  script(true);
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockResolvedValueOnce(
    output(
      {
        intent: 'complaint',
        language: 'en',
        sentiment: 'angry',
        asksForPerson: true,
        confidence: 'high',
        handover: null,
      },
      'gpt-6-luna',
    ),
  );
  expect(await practice.ask(active.storeId, 'I want a person')).toEqual({
    kind: 'handover',
    reason: 'asked_for_person',
  });
});

it.each([
  ['GO_LIVE_NEEDS_KNOWLEDGE', { knowledge: false }],
  ['GO_LIVE_NEEDS_PRODUCTS', { products: false }],
  ['GO_LIVE_NEEDS_HANDOVER_RULES', { rules: false }],
])('refuses to go live with %s', async (code, missing) => {
  const active = await shop(missing);
  await expect(
    practice.goLive(active.storeId, active.userId, active.connectionId),
  ).rejects.toMatchObject({ code });
  expect(await isLive(active.connectionId)).toBe(false);
});

it('refuses to go live with fewer than three test questions', async () => {
  const active = await shop();
  await practice.saveTestQuestions(active.storeId, active.userId, questions.slice(0, 2));
  await expect(
    practice.goLive(active.storeId, active.userId, active.connectionId),
  ).rejects.toMatchObject({
    code: 'GO_LIVE_NEEDS_TEST_QUESTIONS',
  });
});

it('names the test questions that failed and stays in practice', async () => {
  const active = await shop();
  script(true, false, true);
  await expect(
    practice.goLive(active.storeId, active.userId, active.connectionId),
  ).rejects.toMatchObject({
    code: 'GO_LIVE_TESTS_FAILED',
    fields: [{ path: 'testQuestions.1', message: expect.any(String) }],
  });
  expect(await isLive(active.connectionId)).toBe(false);
});

it('goes live when every test passes, records who did it and sends nothing', async () => {
  const active = await shop();
  script(true, true, true);
  await practice.goLive(active.storeId, active.userId, active.connectionId);
  expect(await isLive(active.connectionId)).toBe(true);
  const { rows } = await admin.pool.query(
    'select actor_user_id, action, entity_id from audit_log where store_id = $1',
    [active.storeId],
  );
  expect(rows).toEqual([
    {
      actor_user_id: active.userId,
      action: 'channel_connection.ai_went_live',
      entity_id: active.connectionId,
    },
  ]);
  expect(await sideEffects(active.storeId)).toEqual({
    messages: '0',
    conversations: '0',
    usage: '0',
  });
});

it('cannot take another store’s channel live', async () => {
  const mine = await shop();
  const theirs = await shop();
  await expect(
    practice.goLive(mine.storeId, mine.userId, theirs.connectionId),
  ).rejects.toMatchObject({
    code: 'CHANNEL_CONNECTION_NOT_FOUND',
  });
  expect(await isLive(theirs.connectionId)).toBe(false);
});

it('saves testers that are this store’s contacts and audits the change', async () => {
  const active = await shop();
  const tester = await contact(active.storeId);
  await practice.saveTesters(active.storeId, active.userId, [tester, tester]);
  expect(await practice.testers(active.storeId)).toEqual({ contactIds: [tester] });
  const { rows } = await admin.pool.query(
    'select action, before, after from audit_log where store_id = $1',
    [active.storeId],
  );
  expect(rows).toEqual([
    {
      action: 'ai_agent.testers_changed',
      before: { ids: [] },
      after: { ids: [tester] },
    },
  ]);
});

it('refuses a tester from another store', async () => {
  const mine = await shop();
  const theirs = await shop();
  const stranger = await contact(theirs.storeId);
  await expect(practice.saveTesters(mine.storeId, mine.userId, [stranger])).rejects.toMatchObject({
    code: 'PRACTICE_TESTER_NOT_FOUND',
  });
  expect(await practice.testers(mine.storeId)).toEqual({ contactIds: [] });
});
