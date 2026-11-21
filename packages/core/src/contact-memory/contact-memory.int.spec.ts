import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';

import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { HOUR_MS } from '../platform/time';
import { ContactMemoryModule } from './contact-memory.module';
import { ContactMemoryService } from './contact-memory.service';
import { EraseMemoryOnContactDeleted } from './jobs/erase-memory-on-contact-deleted.job';
import { UpdateConversationMemoryJob } from './jobs/update-conversation-memory.job';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `contact-memory-test-${randomUUID()}`,
    }),
    ContactMemoryModule,
  ],
})(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const stores: string[] = [];
const staffId = randomUUID();
const now = new Date('2026-11-20T12:00:00Z');
const usage = { inputTokens: 500, cachedInputTokens: 0, outputTokens: 80 };
let app: INestApplicationContext;
let respond: ReturnType<typeof vi.spyOn<FakeLlmDriver, 'respond'>>;

beforeAll(async () => {
  await admin.pool.query(
    "insert into users (id, name, email) values ($1::uuid, 'Rina', $1::text || '@example.test')",
    [staffId],
  );
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  respond = vi.spyOn(FakeLlmDriver.prototype, 'respond');
});

beforeEach(() => {
  respond.mockReset();
  respond.mockRejectedValue(new Error('The model must not be called'));
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'ai_runs',
      'messages',
      'orders',
      'contact_memories',
      'conversations',
      'contact_identities',
      'channel_connections',
      'contacts',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [stores]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [stores]);
    await admin.pool.query('delete from users where id = $1', [staffId]);
  } finally {
    await admin.pool.end();
    vi.restoreAllMocks();
  }
});

async function shop() {
  const storeId = randomUUID();
  await admin.pool.query(
    "insert into stores (id, name, extensions) values ($1, 'Memory', '{chats}')",
    [storeId],
  );
  stores.push(storeId);
  return { storeId };
}

async function contact(storeId: string) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts (id, store_id, source, kind) values ($1, $2, 'messenger', 'customer')",
    [id, storeId],
  );
  return id;
}

// Each conversation gets its own page and sender, as one customer on two channels would have.
const senders = new Map<string, string>();
async function conversation(
  { storeId }: Awaited<ReturnType<typeof shop>>,
  contactId: string,
  hoursAgo = 3,
) {
  const id = randomUUID();
  const connectionId = randomUUID();
  await admin.pool.query(
    "insert into channel_connections (id, store_id, kind, external_account_id, display_name) values ($1::uuid, $2, 'facebook_page', $1::text, 'Memory')",
    [connectionId, storeId],
  );
  const identityId = randomUUID();
  await admin.pool.query(
    "insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id) values ($1::uuid, $2, $3, $4, 'messenger', $1::text)",
    [identityId, storeId, contactId, connectionId],
  );
  senders.set(id, identityId);
  await admin.pool.query(
    `insert into conversations (id, store_id, contact_id, channel_connection_id, channel, last_message_at)
     values ($1, $2, $3, $4, 'messenger', $5)`,
    [id, storeId, contactId, connectionId, new Date(now.getTime() - hoursAgo * HOUR_MS)],
  );
  return id;
}

async function message(
  storeId: string,
  conversationId: string,
  body: string,
  hoursAgo: number,
  direction: 'in' | 'out' = 'in',
) {
  const id = randomUUID();
  await admin.pool.query(
    `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status, created_at, sender_identity_id)
     values ($1, $2, $3, $4, $5, 'text', $6, 'received', $7, $8)`,
    [
      id,
      storeId,
      conversationId,
      direction,
      direction === 'in' ? 'customer' : 'ai',
      body,
      new Date(now.getTime() - hoursAgo * HOUR_MS),
      direction === 'in' ? senders.get(conversationId) : null,
    ],
  );
  return id;
}

function modelAnswers(facts: object[], customerSummary = 'Prefers size M.') {
  respond.mockResolvedValue({
    kind: 'output',
    output: { conversationSummary: 'Asked for a kurti in M.', customerSummary, facts },
    usage,
    model: 'fake',
    responseId: 'r',
  });
}

const memoryOf = async (contactId: string) =>
  (
    await admin.pool.query(
      'select summary, facts, version, cleared_at from contact_memories where contact_id = $1',
      [contactId],
    )
  ).rows[0] as
    | {
        summary: string;
        facts: { kind: string; source: string }[];
        version: number;
        cleared_at: Date | null;
      }
    | undefined;

const checkpointOf = async (conversationId: string) =>
  (
    await admin.pool.query(
      'select memory_built_through_message_id as id, memory_version as version, ai_summary from conversations where id = $1',
      [conversationId],
    )
  ).rows[0] as { id: string | null; version: number; ai_summary: string | null };

const service = () => app.get(ContactMemoryService);

it('learns a fact once and does not read the same messages again', async () => {
  const shopRow = await shop();
  const contactId = await contact(shopRow.storeId);
  const conversationId = await conversation(shopRow, contactId);
  const messageId = await message(shopRow.storeId, conversationId, 'M size lagbe', 3);
  await message(shopRow.storeId, conversationId, 'Sure, M is in stock', 3, 'out');
  modelAnswers([{ kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId }]);

  await service().updateFromConversation(shopRow.storeId, conversationId, false);
  await service().updateFromConversation(shopRow.storeId, conversationId, false);

  expect(respond).toHaveBeenCalledTimes(1);
  expect(await memoryOf(contactId)).toMatchObject({
    summary: 'Prefers size M.',
    facts: [{ kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId }],
    version: 1,
  });
  expect(await checkpointOf(conversationId)).toEqual({
    id: messageId,
    version: 1,
    ai_summary: 'Asked for a kurti in M.',
  });
  expect(await service().dueConversations()).not.toContainEqual({
    storeId: shopRow.storeId,
    conversationId,
  });
});

it('keeps each conversation checkpoint separate and does not repeat facts across channels', async () => {
  const shopRow = await shop();
  const contactId = await contact(shopRow.storeId);
  const first = await conversation(shopRow, contactId);
  const second = await conversation(shopRow, contactId);
  const firstMessage = await message(shopRow.storeId, first, 'M size lagbe', 3);
  const secondMessage = await message(shopRow.storeId, second, 'm size', 3);
  const answer = (sourceId: string) =>
    modelAnswers([{ kind: 'size', value: 'M', source: 'customer_message', sourceId }]);

  answer(firstMessage);
  await service().updateFromConversation(shopRow.storeId, first, false);
  answer(secondMessage);
  await service().updateFromConversation(shopRow.storeId, second, false);
  await service().updateFromConversation(shopRow.storeId, first, false);
  await service().updateFromConversation(shopRow.storeId, second, false);

  expect(respond).toHaveBeenCalledTimes(2);
  expect((await memoryOf(contactId))?.facts).toHaveLength(1);
  expect((await checkpointOf(second)).id).toBe(secondMessage);
});

it('discards a model answer when staff clear the memory during the call', async () => {
  const shopRow = await shop();
  const contactId = await contact(shopRow.storeId);
  const conversationId = await conversation(shopRow, contactId);
  const messageId = await message(shopRow.storeId, conversationId, 'M size lagbe', 3);
  respond.mockImplementation(async () => {
    await service().clear(shopRow.storeId, contactId, staffId);
    return {
      kind: 'output',
      output: {
        conversationSummary: 'Old chat.',
        customerSummary: 'Old summary.',
        facts: [{ kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId }],
      },
      usage,
      model: 'fake',
      responseId: 'r',
    };
  });

  await expect(
    service().updateFromConversation(shopRow.storeId, conversationId, false),
  ).rejects.toMatchObject({ code: 'CONTACT_MEMORY_CHANGED' });

  expect(await memoryOf(contactId)).toMatchObject({ summary: '', facts: [], version: 1 });
  expect((await memoryOf(contactId))?.cleared_at).not.toBeNull();
  // The clear moved the checkpoint, so the cleared history is not read again.
  expect((await checkpointOf(conversationId)).id).toBe(messageId);
  await service().updateFromConversation(shopRow.storeId, conversationId, false);
  expect(respond).toHaveBeenCalledTimes(1);
  await admin.pool.query('delete from contact_memories where contact_id = $1', [contactId]);
});

it('reads only messages after the clear time and keeps staff facts', async () => {
  const shopRow = await shop();
  const contactId = await contact(shopRow.storeId);
  const conversationId = await conversation(shopRow, contactId);
  const oldId = await message(shopRow.storeId, conversationId, 'old chat', 5);
  const newId = await message(shopRow.storeId, conversationId, 'red colour pasand', 3);
  const staffFact = {
    kind: 'style',
    value: 'prefers cotton',
    source: 'staff',
    sourceId: randomUUID(),
    at: now.toISOString(),
  };
  await admin.pool.query(
    "insert into contact_memories (contact_id, store_id, summary, facts, cleared_at, edited_at) values ($1, $2, 'Staff note', $3, $4, now())",
    [
      contactId,
      shopRow.storeId,
      JSON.stringify([staffFact]),
      new Date(now.getTime() - 4 * HOUR_MS),
    ],
  );
  modelAnswers(
    [{ kind: 'colour', value: 'red', source: 'customer_message', sourceId: newId }],
    'Model',
  );

  await service().updateFromConversation(shopRow.storeId, conversationId, false);

  const sent = JSON.parse(String(respond.mock.calls[0]?.[0].input));
  expect(sent.new_customer_messages.map((it: { id: string }) => it.id)).toEqual([newId]);
  expect(sent.new_customer_messages.map((it: { id: string }) => it.id)).not.toContain(oldId);
  const memory = await memoryOf(contactId);
  expect(memory?.summary).toBe('Staff note');
  expect(memory?.facts.map((it) => it.source)).toEqual(['staff', 'customer_message']);
});

it('learns a delivery area from a self-delivery order only', async () => {
  const shopRow = await shop();
  const contactId = await contact(shopRow.storeId);
  const conversationId = await conversation(shopRow, contactId);
  await message(shopRow.storeId, conversationId, 'order korbo', 3);
  const orderIds: string[] = [];
  for (const [number, isRecipientBuyer, district] of [
    [1, true, 'Dhaka'],
    [2, false, 'Sylhet'],
  ] as const) {
    const id = randomUUID();
    orderIds.push(id);
    await admin.pool.query(
      `insert into orders (id, store_id, number, source, created_by_type, buyer_contact_id, is_recipient_buyer,
        recipient_name, recipient_phone, recipient_address, recipient_district, items_subtotal_poisha, cod_amount_poisha, created_at)
       values ($1, $2, $3, 'messenger', 'user', $4, $5, 'R', '01700000000', 'Road 1', $6, 100, 100, $7)`,
      [
        id,
        shopRow.storeId,
        number,
        contactId,
        isRecipientBuyer,
        district,
        new Date(now.getTime() - 4 * HOUR_MS),
      ],
    );
  }
  modelAnswers([
    { kind: 'delivery_area', value: 'Dhaka', source: 'own_order', sourceId: orderIds[0] },
    { kind: 'delivery_area', value: 'Sylhet', source: 'own_order', sourceId: orderIds[1] },
  ]);

  await service().updateFromConversation(shopRow.storeId, conversationId, false);

  const sent = JSON.parse(String(respond.mock.calls[0]?.[0].input));
  expect(JSON.stringify(sent)).not.toContain('Sylhet');
  expect((await memoryOf(contactId))?.facts.map((it) => it.kind)).toEqual(['delivery_area']);
});

it('does nothing for another store and queues only quiet conversations', async () => {
  const shopA = await shop();
  const shopB = await shop();
  const contactId = await contact(shopA.storeId);
  const quiet = await conversation(shopA, contactId, 3);
  const recent = await conversation(shopA, contactId, 1);
  await message(shopA.storeId, quiet, 'hello', 3);
  await message(shopA.storeId, recent, 'hello again', 1);

  await service().updateFromConversation(shopB.storeId, quiet, false);

  expect(respond).not.toHaveBeenCalled();
  const due = await service().dueConversations();
  expect(due).toContainEqual({ storeId: shopA.storeId, conversationId: quiet });
  expect(due).not.toContainEqual({ storeId: shopA.storeId, conversationId: recent });
  await admin.pool.query("update conversations set status = 'done' where id = $1", [recent]);
  expect(await service().dueConversations()).toContainEqual({
    storeId: shopA.storeId,
    conversationId: recent,
  });
});

it('moves past a conversation the model cannot read without changing facts', async () => {
  const shopRow = await shop();
  const contactId = await contact(shopRow.storeId);
  const conversationId = await conversation(shopRow, contactId);
  const messageId = await message(shopRow.storeId, conversationId, '👍', 3);
  await admin.pool.query('update messages set body = null where id = $1', [messageId]);

  await app
    .get(UpdateConversationMemoryJob)
    .handle({ storeId: shopRow.storeId, conversationId }, false);

  expect(respond).not.toHaveBeenCalled();
  expect(await memoryOf(contactId)).toMatchObject({ summary: '', facts: [] });
  expect((await checkpointOf(conversationId)).id).toBe(messageId);
});

it('erases memory when a contact is deleted and never builds it again', async () => {
  const shopRow = await shop();
  const contactId = await contact(shopRow.storeId);
  const conversationId = await conversation(shopRow, contactId);
  const messageId = await message(shopRow.storeId, conversationId, 'M size lagbe', 3);
  modelAnswers([{ kind: 'size', value: 'M', source: 'customer_message', sourceId: messageId }]);
  await service().updateFromConversation(shopRow.storeId, conversationId, false);
  await message(shopRow.storeId, conversationId, 'red colour', 2);
  await admin.pool.query('update contacts set deleted_at = now() where id = $1', [contactId]);
  const erase = () =>
    app.get(EraseMemoryOnContactDeleted).handle(
      {
        id: randomUUID(),
        type: 'contact.deleted',
        storeId: shopRow.storeId,
        occurredAt: now.toISOString(),
        payload: { contactId },
      },
      false,
    );

  await erase();
  await erase();
  await service().updateFromConversation(shopRow.storeId, conversationId, false);

  expect(await memoryOf(contactId)).toMatchObject({ summary: '', facts: [] });
  expect((await memoryOf(contactId))?.cleared_at).not.toBeNull();
  expect(respond).toHaveBeenCalledTimes(1);
  expect(await service().dueConversations()).not.toContainEqual({
    storeId: shopRow.storeId,
    conversationId,
  });
});
