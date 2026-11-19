import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { MessagingModule } from './messaging.module';
import { MessagingService } from './messaging.service';

class TestModule {}
Module({ imports: [DatabaseModule, MessagingModule] })(TestModule);

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
    [id, storeId, kind, id, sentAt],
  );
  return id;
}

function inbound(connectionId: string, externalMessageId: string, content = 'দাম কত?') {
  return { connectionId, externalMessageId, externalSenderId: 'sender-test', content, sentAt };
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
    await admin.pool.query<{ contact_id: string }>(
      'select contact_id from contact_identities where store_id = $1 and channel_connection_id = $2',
      [storeId, firstPage],
    )
  ).rows;
  await admin.pool.query(
    `insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id)
     values ($1, $2, $3, $4, 'messenger', 'sender-test')`,
    [randomUUID(), storeId, firstIdentity?.contact_id, secondPage],
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
});

it('claims one identity even for concurrent callers outside the messaging store lock', async () => {
  const storeId = await store();
  const connectionId = await connection(storeId);
  const contacts = app.get(ContactsService);
  const identity = {
    connectionId,
    channel: 'messenger' as const,
    externalId: 'sender-test',
    profile: { name: ' রিনা ' },
  };
  const ids = await Promise.all([
    contacts.findOrCreateByIdentity(storeId, identity),
    contacts.findOrCreateByIdentity(storeId, identity),
  ]);
  expect(ids[0]).toEqual(expect.any(String));
  expect(ids[1]).toBe(ids[0]);
  const { rows } = await admin.pool.query(
    'select id, name, kind from contacts where store_id = $1',
    [storeId],
  );
  expect(rows).toEqual([{ id: ids[0], name: 'রিনা', kind: 'chat_only' }]);
});

it.each([
  ['facebook_page', 'messenger', ' STOP '],
  ['facebook_page', 'messenger', 'বন্ধ'],
  ['whatsapp', 'whatsapp', 'STOP'],
  ['whatsapp', 'whatsapp', 'বন্ধ'],
])(
  'records a %s STOP withdrawal in the same transaction as the message',
  async (kind, channel, keyword) => {
    const storeId = await store();
    const connectionId = await connection(storeId, kind);
    const service = app.get(MessagingService);
    const message = inbound(connectionId, 'stop-message', keyword);
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
    }),
  ).toBe('stored');
  expect(
    await service.receiveInboundMessage(storeId, {
      ...inbound(connectionId, 'invalid-time'),
      sentAt: new Date(now + 100 * DAY_MS),
    }),
  ).toBe('invalid_timestamp');
});
