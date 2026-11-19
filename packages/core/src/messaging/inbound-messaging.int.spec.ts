import 'reflect-metadata';
import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { InboundMessagingRepository } from './inbound-messaging.repository';
import { InboxModule } from './inbox.module';
import { InboxService } from './inbox.service';
import { MessagingModule } from './messaging.module';
import { MessagingService } from './messaging.service';

class TestModule {}
Module({ imports: [DatabaseModule, InboxModule, MessagingModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const fixtures: string[] = [];
const sentAt = new Date('2026-11-19T03:00:00Z');
let app: INestApplicationContext;

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'outbox_events',
      'consents',
      'audit_log',
      'messages',
      'conversations',
      'contact_identities',
      'contacts',
      'channel_connections',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [fixtures]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [fixtures]);
  } finally {
    await admin.pool.end();
  }
});

async function store() {
  const storeId = randomUUID();
  await admin.pool.query('insert into stores (id, name, extensions) values ($1, $2, $3)', [
    storeId,
    'Inbound test',
    [],
  ]);
  fixtures.push(storeId);
  return storeId;
}

async function connection(storeId: string, kind = 'facebook_page') {
  const id = randomUUID();
  await admin.pool.query(
    `insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at)
    values ($1, $2, $3, $4, 'Inbound test', $5)`,
    [id, storeId, kind, id, new Date(sentAt.getTime() - 2 * MINUTE_MS)],
  );
  return id;
}

function inbound(
  externalAccountId: string,
  externalMessageId: string,
  content = 'দাম কত?',
  kind: 'facebook_page' | 'whatsapp' = 'facebook_page',
) {
  return {
    kind,
    externalAccountId,
    externalMessageId,
    externalSenderId: 'sender-test',
    content,
    sentAt,
    receivedAt: sentAt,
  };
}

it('stores a duplicate only once and makes one contact and conversation for concurrent arrivals with Chats off', async () => {
  const storeId = await store();
  const otherStore = await store();
  const connectionId = await connection(storeId);
  const service = app.get(MessagingService);
  const first = inbound(connectionId, 'first');
  expect(await service.receiveInboundMessage(otherStore, first)).toBe('unknown_account');
  const results = await Promise.all([
    service.receiveInboundMessage(storeId, first),
    service.receiveInboundMessage(storeId, first),
    service.receiveInboundMessage(storeId, inbound(connectionId, 'second')),
  ]);
  expect(results.sort()).toEqual(['duplicate', 'stored', 'stored']);
  const conversations = await admin.pool.query(
    'select id, unread_count from conversations where store_id = $1',
    [storeId],
  );
  expect(conversations.rows).toEqual([{ id: expect.any(String), unread_count: 2 }]);
  for (const table of ['contacts', 'contact_identities']) {
    const rows = await admin.pool.query(`select id from ${table} where store_id = $1`, [storeId]);
    expect(rows.rows).toHaveLength(1);
  }
  const events = await admin.pool.query(
    'select type from outbox_events where store_id = $1 order by type',
    [storeId],
  );
  expect(events.rows.map(({ type }) => type)).toEqual([
    'contact.created',
    'conversation.started',
    'message.received',
    'message.received',
  ]);
});

it('queues an outbound reply once per store and operation key with Chats off', async () => {
  const storeId = await store();
  const account = await connection(storeId);
  const messaging = app.get(MessagingService);
  await messaging.receiveInboundMessage(storeId, inbound(account, 'before-reply'));
  const {
    rows: [identity],
  } = await admin.pool.query<{ id: string; contact_id: string }>(
    'select id, contact_id from contact_identities where store_id = $1',
    [storeId],
  );
  const aiRunId = randomUUID();
  const input = {
    channel: 'messenger',
    contactId: identity!.contact_id,
    connectionId: account,
    identityId: identity!.id,
    category: 'staff_reply',
    content: 'জি, পণ্যটি আছে।',
    operationKey: 'reply-to-first-message',
    actor: { kind: 'ai', aiRunId },
  } as const;
  const results = await Promise.all([
    messaging.queueChannelMessage(storeId, input),
    messaging.queueChannelMessage(storeId, input),
  ]);
  const { rows } = await admin.pool.query(
    "select id, body, status, ai_run_id from messages where store_id = $1 and direction = 'out'",
    [storeId],
  );
  expect(rows).toEqual([
    { id: expect.any(String), body: input.content, status: 'queued', ai_run_id: aiRunId },
  ]);
  expect(results).toEqual([{ messageId: rows[0]?.id }, { messageId: rows[0]?.id }]);
  const events = await admin.pool.query(
    "select payload from outbox_events where store_id = $1 and type = 'message.send_requested'",
    [storeId],
  );
  expect(events.rows).toEqual([{ payload: { messageId: rows[0]?.id } }]);
  await expect(
    messaging.queueChannelMessage(storeId, { ...input, content: 'A different reply' }),
  ).rejects.toMatchObject({ code: 'MESSAGE_OPERATION_CONFLICT' });
  await expect(
    messaging.queueChannelMessage(storeId, {
      ...input,
      actor: { kind: 'ai', aiRunId: randomUUID() },
    }),
  ).rejects.toMatchObject({ code: 'MESSAGE_OPERATION_CONFLICT' });
});

it.each(['done', 'later'])('reopens a %s conversation only for a new message', async (status) => {
  const storeId = await store();
  const connectionId = await connection(storeId);
  const service = app.get(MessagingService);
  const first = {
    ...inbound(connectionId, 'before-close'),
    sentAt: new Date(sentAt.getTime() + 10_000),
  };
  await expect(service.receiveInboundMessage(storeId, first)).resolves.toBe('stored');
  await admin.pool.query(
    'update conversations set status = $1, responder = $2, version = 3 where store_id = $3',
    [status, 'human', storeId],
  );
  await expect(service.receiveInboundMessage(storeId, first)).resolves.toBe('duplicate');
  const state = () =>
    admin.pool.query('select status, responder, version from conversations where store_id = $1', [
      storeId,
    ]);
  expect((await state()).rows).toEqual([{ status, responder: 'human', version: 3 }]);
  await expect(
    service.receiveInboundMessage(storeId, inbound(connectionId, 'delayed-before-close')),
  ).resolves.toBe('stored');
  expect((await state()).rows).toEqual([{ status, responder: 'human', version: 3 }]);
  await expect(
    service.receiveInboundMessage(storeId, {
      ...inbound(connectionId, 'after-close'),
      sentAt: new Date(sentAt.getTime() + 20_000),
    }),
  ).resolves.toBe('stored');
  expect((await state()).rows).toEqual([{ status: 'open', responder: 'human', version: 4 }]);
});

it('reopens a conversation when its timer fires while the inbound message is being saved', async () => {
  const storeId = await store();
  const connectionId = await connection(storeId);
  const service = app.get(MessagingService);
  await service.receiveInboundMessage(storeId, inbound(connectionId, 'before-takeover'));
  await admin.pool.query("update stores set extensions = array['chats'] where id = $1", [storeId]);
  const {
    rows: [conversation],
  } = await admin.pool.query<{ id: string }>(
    `update conversations set status = 'done', responder = 'human', ai_resumes_at = $2
     where store_id = $1 returning id`,
    [storeId, sentAt],
  );
  const inbox = app.get(InboxService);
  const repository = app.get(InboundMessagingRepository);
  const insert = repository.insertMessage.bind(repository);
  const returnInSeparateTransaction = AsyncResource.bind(() =>
    inbox.returnDue(storeId, conversation!.id, { kind: 'system' }),
  );
  const intercept = vi
    .spyOn(repository, 'insertMessage')
    .mockImplementationOnce(async (...args) => {
      await returnInSeparateTransaction();
      return insert(...args);
    });
  try {
    await expect(
      service.receiveInboundMessage(storeId, {
        ...inbound(connectionId, 'after-takeover'),
        sentAt: new Date(sentAt.getTime() + MINUTE_MS),
      }),
    ).resolves.toBe('stored');
  } finally {
    intercept.mockRestore();
  }
  const { rows } = await admin.pool.query(
    'select status, responder, ai_resumes_at from conversations where store_id = $1',
    [storeId],
  );
  expect(rows).toEqual([{ status: 'open', responder: 'ai', ai_resumes_at: null }]);
});

it('preserves two Page identities for one contact and keeps the newest inbound window', async () => {
  const storeId = await store();
  const [firstPage, secondPage] = await Promise.all([connection(storeId), connection(storeId)]);
  const service = app.get(MessagingService);
  const newest = new Date(sentAt.getTime() + MINUTE_MS);
  await service.receiveInboundMessage(storeId, {
    ...inbound(firstPage, 'same', 'newest'),
    sentAt: newest,
  });
  const [firstIdentity] = (
    await admin.pool.query<{ id: string; contact_id: string }>(
      'select id, contact_id from contact_identities where store_id = $1 and channel_connection_id = $2',
      [storeId, firstPage],
    )
  ).rows;
  const secondIdentityId = randomUUID();
  await admin.pool.query(
    `insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id)
     values ($1, $2, $3, $4, 'messenger', 'sender-test')`,
    [secondIdentityId, storeId, firstIdentity?.contact_id, secondPage],
  );
  const outboundAt = new Date(newest.getTime() + MINUTE_MS);
  await admin.pool.query(
    "update conversations set last_outbound_at = $1, last_message_at = $1, last_message_preview = 'A staff reply' where store_id = $2 and channel_connection_id = $3",
    [outboundAt, storeId, firstPage],
  );
  await service.receiveInboundMessage(storeId, inbound(firstPage, 'old', 'old'));
  expect(await service.receiveInboundMessage(storeId, inbound(secondPage, 'same'))).toBe('stored');
  const { rows } = await admin.pool.query(
    `select contact_id, channel_connection_id, last_inbound_at, window_expires_at, last_message_preview
    from conversations where store_id = $1`,
    [storeId],
  );
  expect(rows).toHaveLength(2);
  expect(rows).toContainEqual({
    contact_id: firstIdentity?.contact_id,
    channel_connection_id: firstPage,
    last_inbound_at: newest,
    window_expires_at: new Date(newest.getTime() + DAY_MS),
    last_message_preview: 'A staff reply',
  });
  expect(rows.map(({ contact_id }) => contact_id)).toEqual([
    firstIdentity?.contact_id,
    firstIdentity?.contact_id,
  ]);
  const identities = await admin.pool.query(
    'select channel_connection_id from contact_identities where store_id = $1',
    [storeId],
  );
  expect(identities.rows.map(({ channel_connection_id }) => channel_connection_id).sort()).toEqual(
    [firstPage, secondPage].sort(),
  );
  const inboundMessages = await admin.pool.query(
    'select body, sender_identity_id from messages where store_id = $1 order by body collate "C"',
    [storeId],
  );
  expect(inboundMessages.rows).toEqual([
    { body: 'newest', sender_identity_id: firstIdentity?.id },
    { body: 'old', sender_identity_id: firstIdentity?.id },
    { body: 'দাম কত?', sender_identity_id: secondIdentityId },
  ]);
});

it('makes a new contact and conversation when a deleted sender writes again', async () => {
  const storeId = await store();
  const account = await connection(storeId);
  const contacts = app.get(ContactsService);
  const messaging = app.get(MessagingService);
  const first = inbound(account, 'before-delete');
  await expect(messaging.receiveInboundMessage(storeId, first)).resolves.toBe('stored');
  const {
    rows: [original],
  } = await admin.pool.query<{ id: string }>('select id from contacts where store_id = $1', [
    storeId,
  ]);
  const {
    rows: [originalIdentity],
  } = await admin.pool.query<{ id: string }>(
    "update contact_identities set profile_name = 'পুরনো নাম' where store_id = $1 returning id",
    [storeId],
  );
  await contacts.remove(storeId, original!.id, { kind: 'system' });
  await expect(messaging.receiveInboundMessage(storeId, first)).resolves.toBe('duplicate');
  const outcomes = await Promise.all([
    messaging.receiveInboundMessage(storeId, inbound(account, 'after-delete-1')),
    messaging.receiveInboundMessage(storeId, inbound(account, 'after-delete-2')),
  ]);
  expect(outcomes).toEqual(['stored', 'stored']);

  const { rows } = await admin.pool.query<{ id: string; deleted_at: Date | null }>(
    'select id, deleted_at from contacts where store_id = $1',
    [storeId],
  );
  expect(rows).toEqual(
    expect.arrayContaining([
      { id: original!.id, deleted_at: expect.any(Date) },
      { id: expect.any(String), deleted_at: null },
    ]),
  );
  expect(rows).toHaveLength(2);
  const active = rows.find(({ deleted_at }) => deleted_at === null)!;
  expect(await contacts.findRecipient(storeId, original!.id)).toBeUndefined();
  expect(await contacts.findRecipient(storeId, active.id)).toMatchObject({ kind: 'chat_only' });
  const { rows: identities } = await admin.pool.query(
    'select id, external_id, profile_name, contact_id from contact_identities where store_id = $1',
    [storeId],
  );
  expect(identities).toHaveLength(2);
  expect(identities).toEqual(
    expect.arrayContaining([
      {
        id: originalIdentity!.id,
        external_id: `deleted:${originalIdentity!.id}`,
        profile_name: null,
        contact_id: original!.id,
      },
      {
        id: expect.any(String),
        external_id: first.externalSenderId,
        profile_name: null,
        contact_id: active.id,
      },
    ]),
  );
  const { rows: conversations } = await admin.pool.query(
    'select contact_id, unread_count from conversations where store_id = $1',
    [storeId],
  );
  expect(conversations).toHaveLength(2);
  expect(conversations).toEqual(
    expect.arrayContaining([
      { contact_id: original!.id, unread_count: 1 },
      { contact_id: active.id, unread_count: 2 },
    ]),
  );
  const replacement = identities.find(({ contact_id }) => contact_id === active.id);
  const stored = await admin.pool.query(
    'select external_id, sender_identity_id from messages where store_id = $1 order by external_id',
    [storeId],
  );
  expect(stored.rows).toEqual([
    { external_id: 'after-delete-1', sender_identity_id: replacement?.id },
    { external_id: 'after-delete-2', sender_identity_id: replacement?.id },
    { external_id: 'before-delete', sender_identity_id: originalIdentity!.id },
  ]);
});

it('claims one identity even for concurrent contact service callers', async () => {
  const storeId = await store();
  const connectionId = await connection(storeId);
  const contacts = app.get(ContactsService);
  const identity = {
    connectionId,
    channel: 'messenger' as const,
    externalId: 'sender-test',
  };
  const ids = await Promise.all([
    contacts.findOrCreateByIdentity(storeId, identity),
    contacts.findOrCreateByIdentity(storeId, identity),
  ]);
  expect(ids[0]).toEqual({ id: expect.any(String), contactId: expect.any(String) });
  expect(ids[1]).toEqual(ids[0]);
  const { rows } = await admin.pool.query(
    'select id, name, kind from contacts where store_id = $1',
    [storeId],
  );
  expect(rows).toEqual([{ id: ids[0].contactId, name: null, kind: 'chat_only' }]);
});

it('does not recreate a deleted contact when an in-flight message is retried', async () => {
  const storeId = await store();
  const account = await connection(storeId);
  const contacts = app.get(ContactsService);
  const messaging = app.get(MessagingService);
  await messaging.receiveInboundMessage(storeId, inbound(account, 'first'));
  const { rows: people } = await admin.pool.query<{ id: string }>(
    'select id from contacts where store_id = $1',
    [storeId],
  );
  const contactId = people[0]!.id;
  const message = inbound(account, 'in-flight');
  const saved = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const original = app.get(StoreTransaction).run(storeId, async () => {
    await expect(messaging.receiveInboundMessage(storeId, message)).resolves.toBe('stored');
    saved.resolve();
    await release.promise;
  });
  let remove: Promise<void> | undefined;
  let retry: ReturnType<MessagingService['receiveInboundMessage']> | undefined;
  try {
    await Promise.race([saved.promise, original]);
    remove = contacts.remove(storeId, contactId, { kind: 'system' });
    await vi.waitFor(async () => {
      const { rows } = await admin.pool.query(
        `select 1 from pg_stat_activity where datname = current_database()
         and wait_event_type = 'Lock' and query like 'update "contacts"%'`,
      );
      expect(rows).toHaveLength(1);
    });
    retry = messaging.receiveInboundMessage(storeId, message);
    await vi.waitFor(async () => {
      const { rows } = await admin.pool.query(
        `select 1 from pg_stat_activity where datname = current_database()
         and wait_event_type = 'Lock'
         and (query like '%from "contact_identities"%' or query like '%pg_advisory_xact_lock%')`,
      );
      expect(rows).toHaveLength(1);
    });
  } finally {
    release.resolve();
    await Promise.allSettled([original, remove, retry]);
  }
  await expect(original).resolves.toBeUndefined();
  await expect(remove).resolves.toBeUndefined();
  await expect(retry).resolves.toBe('duplicate');
  const { rows } = await admin.pool.query(
    'select id, deleted_at from contacts where store_id = $1',
    [storeId],
  );
  expect(rows).toEqual([{ id: contactId, deleted_at: expect.any(Date) }]);
});

it.each([
  ['facebook_page', 'messenger', ' STOP '],
  ['facebook_page', 'messenger', 'বন্ধ'],
  ['whatsapp', 'whatsapp', 'STOP'],
  ['whatsapp', 'whatsapp', 'বন্ধ'],
] as const)(
  'records a %s STOP withdrawal in the same transaction as the message',
  async (kind, channel, keyword) => {
    const storeId = await store();
    const connectionId = await connection(storeId, kind);
    const service = app.get(MessagingService);
    const message = inbound(connectionId, 'stop-message', keyword, kind);
    expect(await service.receiveInboundMessage(storeId, message)).toBe('stored');
    expect(await service.receiveInboundMessage(storeId, message)).toBe('duplicate');
    const { rows } = await admin.pool.query(
      'select channel, status, source from consents where store_id = $1',
      [storeId],
    );
    expect(rows).toEqual([{ channel, status: 'withdrawn', source: 'stop_keyword' }]);
  },
);

it('accepts small provider clock skew and ignores an implausibly future delivery', async () => {
  const storeId = await store();
  const connectionId = await connection(storeId);
  const service = app.get(MessagingService);
  const now = app.get(Clock).now().getTime();
  expect(
    await service.receiveInboundMessage(storeId, {
      ...inbound(connectionId, 'minor-clock-offset'),
      sentAt: new Date(now + MINUTE_MS / 2),
      receivedAt: new Date(now),
    }),
  ).toBe('stored');
  expect(
    await service.receiveInboundMessage(storeId, {
      ...inbound(connectionId, 'invalid-time'),
      sentAt: new Date(now + 100 * DAY_MS),
      receivedAt: new Date(now),
    }),
  ).toBe('invalid_timestamp');
});
