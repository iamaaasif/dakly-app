import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { uuidv7 } from '@dakly/db/uuid-v7';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';

import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { ContactMemoryModule } from './contact-memory.module';
import { ContactMemoryRepository } from './contact-memory.repository';
import { ContactMemoryService } from './contact-memory.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
const userIds: string[] = [];
const fakeRespond = FakeLlmDriver.prototype.respond;

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    ContactMemoryModule,
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `memory-int-${randomUUID()}`,
    }),
  ],
})(TestModule);

let app: INestApplicationContext;
let service: ContactMemoryService;
let repository: ContactMemoryRepository;

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  service = app.get(ContactMemoryService);
  repository = app.get(ContactMemoryRepository);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'outbox_events',
      'ai_runs',
      'contact_memories',
      'orders',
      'messages',
      'conversations',
      'contact_identities',
      'contacts',
      'channel_connections',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [storeIds]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [storeIds]);
    await admin.pool.query('delete from users where id = any($1::uuid[])', [userIds]);
  } finally {
    await admin.pool.end();
  }
});

async function shop() {
  const storeId = randomUUID();
  storeIds.push(storeId);
  await admin.pool.query(
    "insert into stores (id, name, extensions) values ($1, 'Memory test', '{chats}')",
    [storeId],
  );
  return { storeId, staffId: await staff() };
}

async function staff() {
  const userId = randomUUID();
  userIds.push(userId);
  await admin.pool.query(
    'insert into users (id, name, phone, phone_verified_at) values ($1, $2, $3, now())',
    [userId, 'Rina', `019${Math.floor(10000000 + Math.random() * 89999999)}`],
  );
  return userId;
}

async function contact(storeId: string) {
  const contactId = randomUUID();
  await admin.pool.query(
    "insert into contacts (id, store_id, source, kind, name) values ($1, $2, 'messenger', 'customer', 'Customer')",
    [contactId, storeId],
  );
  return contactId;
}

async function chat(
  storeId: string,
  contactId: string,
  channel: 'messenger' | 'whatsapp' = 'messenger',
) {
  const connectionId = randomUUID();
  const conversationId = randomUUID();
  await admin.pool.query(
    "insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at) values ($1::uuid, $2, 'facebook_page', $1::text, 'Page', now())",
    [connectionId, storeId],
  );
  await admin.pool.query(
    'insert into conversations (id, store_id, contact_id, channel_connection_id, channel) values ($1, $2, $3, $4, $5)',
    [conversationId, storeId, contactId, connectionId, channel],
  );
  const identityId = randomUUID();
  await admin.pool.query(
    'insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id) values ($1::uuid, $2, $3, $4, $5, $1::text)',
    [identityId, storeId, contactId, connectionId, channel],
  );
  identities.set(conversationId, identityId);
  return conversationId;
}

const identities = new Map<string, string>();
let clock = Date.parse('2026-11-01T10:00:00.000Z');
async function say(
  storeId: string,
  conversationId: string,
  body: string,
  options: { direction?: 'in' | 'out'; id?: string; at?: Date; kind?: string } = {},
) {
  const id = options.id ?? uuidv7();
  clock += 60_000;
  const direction = options.direction ?? 'in';
  await admin.pool.query(
    `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status, created_at, sender_identity_id)
     values ($1, $2, $3, $4, $5, $6, $7, 'received', $8, $9)`,
    [
      id,
      storeId,
      conversationId,
      direction,
      direction === 'in' ? 'customer' : 'ai',
      options.kind ?? 'text',
      body,
      options.at ?? new Date(clock),
      direction === 'in' ? identities.get(conversationId) : null,
    ],
  );
  return id;
}

async function order(
  storeId: string,
  contactId: string,
  district: string,
  isRecipientBuyer: boolean,
  at = new Date(),
) {
  const id = randomUUID();
  await admin.pool.query(
    `insert into orders (id, store_id, number, source, created_by_type, buyer_contact_id, is_recipient_buyer,
       recipient_name, recipient_phone, recipient_address, recipient_district, items_subtotal_poisha, cod_amount_poisha, created_at)
     values ($1, $2, $3, 'messenger', 'ai', $4, $5, 'R', '01711111111', 'House 1', $6, 100, 100, $7)`,
    [id, storeId, Math.floor(Math.random() * 1_000_000), contactId, isRecipientBuyer, district, at],
  );
  return id;
}

type Scripted = {
  conversationSummary?: string;
  customerSummary?: string;
  facts?: { kind: string; value: string; messageId: string }[];
};

// Each model call takes the next script; the hook runs while the call is in flight.
function scriptModel(scripts: (Scripted | (() => Promise<Scripted>))[]) {
  const inputs: string[] = [];
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockImplementation(async function (
    this: FakeLlmDriver,
    request,
  ) {
    inputs.push(request.input);
    const next = scripts.shift();
    if (!next) throw new Error('No scripted memory response left');
    const output = typeof next === 'function' ? await next() : next;
    const driver = new FakeLlmDriver([
      {
        kind: 'output',
        output: { conversationSummary: 'summary', customerSummary: '', facts: [], ...output },
        usage: { inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 },
        responseId: 'fake-memory',
        model: 'gpt-6-luna',
      },
    ]);
    return fakeRespond.call(driver, request);
  });
  return inputs;
}

// Picks the answer by which message id the model was shown, so chat order does not matter.
function scriptByMessage(answers: Record<string, Scripted>) {
  vi.spyOn(FakeLlmDriver.prototype, 'respond').mockImplementation(async function (request) {
    const shown = request.input.slice(request.input.indexOf('<new_messages'));
    const key = Object.keys(answers).find((messageId) => shown.includes(messageId));
    const driver = new FakeLlmDriver([
      {
        kind: 'output',
        output: {
          conversationSummary: 'summary',
          customerSummary: '',
          facts: [],
          ...answers[key ?? ''],
        },
        usage: { inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 },
        responseId: 'fake-memory',
        model: 'gpt-6-luna',
      },
    ]);
    return fakeRespond.call(driver, request);
  });
}

async function stored(storeId: string, contactId: string) {
  const { rows } = await admin.pool.query(
    'select summary, facts, cleared_at, version from contact_memories where store_id = $1 and contact_id = $2',
    [storeId, contactId],
  );
  return rows[0] as
    | {
        summary: string;
        facts: { kind: string; value: string; source: string }[];
        cleared_at: Date | null;
        version: number;
      }
    | undefined;
}

async function conversationRow(conversationId: string) {
  const { rows } = await admin.pool.query(
    'select ai_summary, memory_version, memory_built_through_message_id as through from conversations where id = $1',
    [conversationId],
  );
  return rows[0] as { ai_summary: string | null; memory_version: number; through: string | null };
}

it('learns stated facts, advances the checkpoint and does nothing on replay', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const conversationId = await chat(storeId, contactId);
  await say(storeId, conversationId, 'Hi');
  const sized = await say(storeId, conversationId, 'amar size M, lal color pochondo');
  const inputs = scriptModel([
    {
      conversationSummary: 'Asked about size M in red',
      customerSummary: 'Likes red, wears M',
      facts: [
        { kind: 'size', value: 'M', messageId: sized },
        { kind: 'colour', value: 'লাল', messageId: sized },
      ],
    },
  ]);

  expect(await service.updateFromConversation(storeId, conversationId)).toBe('updated');
  expect((await stored(storeId, contactId))?.facts.map(({ value }) => value)).toEqual(['M', 'লাল']);
  expect((await conversationRow(conversationId)).through).toBe(sized);
  expect((await conversationRow(conversationId)).ai_summary).toBe('Asked about size M in red');

  expect(await service.updateFromConversation(storeId, conversationId)).toBe('skipped');
  expect(inputs).toHaveLength(1);
});

it('updates the conversation summary and checkpoint when nothing durable was said', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const conversationId = await chat(storeId, contactId);
  const last = await say(storeId, conversationId, 'dhonnobad');
  scriptModel([{ conversationSummary: 'Thanked the shop' }]);

  expect(await service.updateFromConversation(storeId, conversationId)).toBe('nothing_new');
  expect(await stored(storeId, contactId)).toBeUndefined();
  expect(await conversationRow(conversationId)).toMatchObject({
    ai_summary: 'Thanked the shop',
    through: last,
  });
});

it('keeps each conversation checkpoint separate across Messenger and WhatsApp', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const messenger = await chat(storeId, contactId, 'messenger');
  const whatsapp = await chat(storeId, contactId, 'whatsapp');
  const first = await say(storeId, messenger, 'size L');
  const second = await say(storeId, whatsapp, 'budget 2000 takar moddhe');
  const inputs = scriptModel([
    { facts: [{ kind: 'size', value: 'L', messageId: first }] },
    { facts: [{ kind: 'budget', value: '2000 taka', messageId: second }] },
  ]);

  await service.updateFromConversation(storeId, messenger);
  await service.updateFromConversation(storeId, whatsapp);
  expect(await service.updateFromConversation(storeId, messenger)).toBe('skipped');
  expect(await service.updateFromConversation(storeId, whatsapp)).toBe('skipped');

  expect(inputs).toHaveLength(2);
  expect((await stored(storeId, contactId))?.facts.map(({ value }) => value)).toEqual([
    'L',
    '2000 taka',
  ]);
});

it('drops facts that cite another message, a payment number or a gift address', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const conversationId = await chat(storeId, contactId);
  const shopReply = await say(storeId, conversationId, 'Our size chart is M or L', {
    direction: 'out',
  });
  const mine = await say(storeId, conversationId, 'bkash 01711223344 theke dibo');
  scriptModel([
    {
      facts: [
        { kind: 'size', value: 'M', messageId: shopReply },
        { kind: 'style', value: 'pays 01711223344', messageId: mine },
        { kind: 'style', value: 'cotton', messageId: randomUUID() },
      ],
    },
  ]);
  const gift = await order(storeId, contactId, 'Sylhet', false);
  const own = await order(storeId, contactId, 'Mirpur', true);

  await service.updateFromConversation(storeId, conversationId);

  const memory = await stored(storeId, contactId);
  expect(memory?.facts).toHaveLength(1);
  expect(memory?.facts[0]).toMatchObject({
    kind: 'delivery_area',
    value: 'Mirpur',
    source: 'own_order',
  });
  expect(JSON.stringify(memory)).not.toContain(gift);
  expect(JSON.stringify(memory?.facts)).toContain(own);
});

it('discards a model result when staff edit during the call and reads again', async () => {
  const { storeId, staffId } = await shop();
  const contactId = await contact(storeId);
  const conversationId = await chat(storeId, contactId);
  const message = await say(storeId, conversationId, 'size XL');
  const staffFact = {
    kind: 'style',
    value: 'Prefers cotton',
    source: 'staff',
    sourceId: contactId,
    at: new Date().toISOString(),
  };
  const inputs = scriptModel([
    async () => {
      await service.saveStaffEdit(storeId, contactId, staffId, {
        summary: 'VIP',
        facts: [staffFact],
      });
      return {
        customerSummary: 'Model summary',
        facts: [{ kind: 'size', value: 'XL', messageId: message }],
      };
    },
    {
      customerSummary: 'Model summary',
      facts: [{ kind: 'size', value: 'XL', messageId: message }],
    },
  ]);

  await service.updateFromConversation(storeId, conversationId);

  const memory = await stored(storeId, contactId);
  expect(inputs).toHaveLength(2);
  expect(memory?.summary).toBe('VIP');
  expect(memory?.facts.map(({ value }) => value).sort()).toEqual(['Prefers cotton', 'XL']);
});

it('cannot be forged into a model fact by a staff edit', async () => {
  const { storeId, staffId } = await shop();
  const contactId = await contact(storeId);
  await expect(
    service.saveStaffEdit(storeId, contactId, staffId, {
      summary: '',
      facts: [
        {
          kind: 'size',
          value: 'S',
          source: 'customer_message',
          sourceId: randomUUID(),
          at: new Date().toISOString(),
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'CONTACT_MEMORY_INVALID' });
});

it('clear during a model call drops the stale result and old evidence never returns', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const conversationId = await chat(storeId, contactId);
  const before = await say(storeId, conversationId, 'size S');
  await order(storeId, contactId, 'Dhanmondi', true, new Date(clock - 1000));
  scriptModel([
    async () => {
      await service.clear(storeId, contactId, null);
      return { facts: [{ kind: 'size', value: 'S', messageId: before }] };
    },
  ]);

  expect(await service.updateFromConversation(storeId, conversationId)).toBe('skipped');
  expect(await stored(storeId, contactId)).toMatchObject({ summary: '', facts: [] });

  // The cleared chat has nothing before the cutoff left to read, so a new message is learned alone.
  clock += 60 * 60_000;
  await admin.pool.query('update contact_memories set cleared_at = $2 where contact_id = $1', [
    contactId,
    new Date(clock - 30_000),
  ]);
  const after = await say(storeId, conversationId, 'color black');
  const inputs = scriptModel([{ facts: [{ kind: 'colour', value: 'black', messageId: after }] }]);
  await service.updateFromConversation(storeId, conversationId);
  const memory = await stored(storeId, contactId);
  expect(memory?.facts.map(({ value }) => value)).toEqual(['black']);
  expect(inputs[0]).not.toContain('size S');
});

it('rebuilds from a checkpoint reset by a late insert', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const conversationId = await chat(storeId, contactId);
  const first = await say(storeId, conversationId, 'first');
  const second = await say(storeId, conversationId, 'second');
  scriptModel([{}]);
  await service.updateFromConversation(storeId, conversationId);
  expect((await conversationRow(conversationId)).through).toBe(second);

  // A provider message with an earlier send time arrives after the checkpoint.
  const late = await say(storeId, conversationId, 'late arrival', {
    at: new Date(clock - 3 * 60_000),
  });
  const inputs = scriptModel([{ facts: [{ kind: 'size', value: 'M', messageId: late }] }]);
  await service.updateFromConversation(storeId, conversationId);

  expect(inputs[0]).toContain(first);
  expect(inputs[0]).toContain('late arrival');
  expect((await stored(storeId, contactId))?.facts.map(({ value }) => value)).toEqual(['M']);
});

it('merge then undo rebuild both memories from their own chats and keep staff facts', async () => {
  const { storeId, staffId } = await shop();
  const buyer = await contact(storeId);
  const other = await contact(storeId);
  const buyerChat = await chat(storeId, buyer);
  const otherChat = await chat(storeId, other);
  const buyerMessage = await say(storeId, buyerChat, 'size M');
  const otherMessage = await say(storeId, otherChat, 'size XXL');
  scriptModel([
    { customerSummary: 'wears M', facts: [{ kind: 'size', value: 'M', messageId: buyerMessage }] },
    {
      customerSummary: 'wears XXL',
      facts: [{ kind: 'size', value: 'XXL', messageId: otherMessage }],
    },
  ]);
  await service.updateFromConversation(storeId, buyerChat);
  await service.updateFromConversation(storeId, otherChat);
  await service.saveStaffEdit(storeId, buyer, staffId, {
    summary: '',
    facts: [
      {
        kind: 'style',
        value: 'Prefers cotton',
        source: 'staff',
        sourceId: buyer,
        at: new Date().toISOString(),
      },
    ],
  });

  // Merge: the other buyer's chat moves to the surviving contact.
  await admin.pool.query('update conversations set contact_id = $2 where id = $1', [
    otherChat,
    buyer,
  ]);
  await service.invalidateForOwnershipChange(storeId, [buyer, other]);

  expect(await stored(storeId, buyer)).toMatchObject({
    summary: '',
    facts: [expect.objectContaining({ value: 'Prefers cotton' })],
  });
  expect((await stored(storeId, other))?.facts).toEqual([]);
  expect((await conversationRow(buyerChat)).through).toBeNull();
  const { rows: events } = await admin.pool.query(
    "select payload->>'contactId' as contact_id from outbox_events where store_id = $1 and type = 'contact_memory.rebuild_requested'",
    [storeId],
  );
  expect(events.map(({ contact_id }) => contact_id).sort()).toEqual([buyer, other].sort());

  scriptByMessage({
    [buyerMessage]: { facts: [{ kind: 'size', value: 'M', messageId: buyerMessage }] },
    [otherMessage]: { facts: [{ kind: 'size', value: 'XXL', messageId: otherMessage }] },
  });
  await service.rebuild(storeId, buyer);
  expect((await stored(storeId, buyer))?.facts.map(({ value }) => value).sort()).toEqual([
    'M',
    'Prefers cotton',
    'XXL',
  ]);

  // Undo: the chat goes back, and both memories are emptied of derived facts again.
  await admin.pool.query('update conversations set contact_id = $2 where id = $1', [
    otherChat,
    other,
  ]);
  await service.invalidateForOwnershipChange(storeId, [buyer, other]);
  scriptByMessage({
    [buyerMessage]: { facts: [{ kind: 'size', value: 'M', messageId: buyerMessage }] },
    [otherMessage]: { facts: [{ kind: 'size', value: 'XXL', messageId: otherMessage }] },
  });
  await service.rebuild(storeId, buyer);
  await service.rebuild(storeId, other);
  expect((await stored(storeId, buyer))?.facts.map(({ value }) => value).sort()).toEqual([
    'M',
    'Prefers cotton',
  ]);
  expect((await stored(storeId, other))?.facts.map(({ value }) => value)).toEqual(['XXL']);
});

it('keeps the strictest clear cutoff through a merge', async () => {
  const { storeId } = await shop();
  const kept = await contact(storeId);
  const merged = await contact(storeId);
  await service.clear(storeId, kept, null);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await service.clear(storeId, merged, null);
  const later = (await stored(storeId, merged))!.cleared_at;

  await service.invalidateForOwnershipChange(storeId, [kept, merged]);

  expect((await stored(storeId, kept))?.cleared_at?.getTime()).toBe(later?.getTime());
});

it('does not build memory for a deleted contact', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const conversationId = await chat(storeId, contactId);
  await say(storeId, conversationId, 'size M');
  await admin.pool.query('update contacts set deleted_at = now() where id = $1', [contactId]);
  const inputs = scriptModel([{}]);

  expect(await service.updateFromConversation(storeId, conversationId)).toBe('skipped');
  expect(inputs).toHaveLength(0);
  expect(await stored(storeId, contactId)).toBeUndefined();
});

it('finds only conversations that have been quiet for two hours', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  const quiet = await chat(storeId, contactId);
  const busy = await chat(storeId, await contact(storeId));
  const asOf = new Date('2026-12-01T12:00:00.000Z');
  await admin.pool.query('update conversations set last_message_at = $2 where id = $1', [
    quiet,
    new Date(asOf.getTime() - 3 * 3_600_000),
  ]);
  await admin.pool.query('update conversations set last_message_at = $2 where id = $1', [
    busy,
    new Date(asOf.getTime() - 30 * 60_000),
  ]);

  const due = (await repository.dueConversations(asOf)).filter((row) => row.storeId === storeId);

  expect(due.map(({ conversationId }) => conversationId)).toEqual([quiet]);
});

it('renders context for the reply only within both limits', async () => {
  const { storeId } = await shop();
  const contactId = await contact(storeId);
  await admin.pool.query(
    'insert into contact_memories (store_id, contact_id, summary, facts) values ($1, $2, $3, $4)',
    [
      storeId,
      contactId,
      'Likes cotton',
      JSON.stringify([
        {
          kind: 'size',
          value: 'M',
          source: 'customer_message',
          sourceId: randomUUID(),
          at: new Date().toISOString(),
        },
      ]),
    ],
  );

  const text = await service.contextFor(storeId, contactId);

  // The fake model name has no tokenizer, so memory is left out rather than measured by a guess.
  expect(text).toBeNull();
});
