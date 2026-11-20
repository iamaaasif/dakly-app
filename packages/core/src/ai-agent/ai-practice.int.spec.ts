import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { TestQuestion } from '@dakly/contracts/ai-practice';
import { createDatabase } from '@dakly/db/client';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import type { LlmResult } from '@dakly/providers/llm/llm-driver';

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
  });
  expect(await sideEffects(active.storeId)).toEqual({
    messages: '0',
    conversations: '0',
    usage: '0',
  });
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
