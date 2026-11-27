import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { ConversationReplyService } from './conversation-reply.service';
import { InboxModule } from './inbox.module';
import { InboxService } from './inbox.service';
import { MessagingModule } from './messaging.module';
import { MessagingService } from './messaging.service';

class TestModule {}
Module({ imports: [DatabaseModule, InboxModule, MessagingModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const fixtures: string[] = [];
const users: string[] = [];
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
    await admin.pool.query('delete from users where id = any($1::uuid[])', [users]);
  } finally {
    await admin.pool.end();
  }
});

async function chatWithCustomer() {
  const storeId = randomUUID();
  const connectionId = randomUUID();
  fixtures.push(storeId);
  await admin.pool.query(
    "insert into stores (id, name, extensions) values ($1, 'Reply test', array['chats'])",
    [storeId],
  );
  await admin.pool.query(
    `insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at)
     values ($1::uuid, $2, 'facebook_page', $1::text, 'Reply test', now() - interval '1 day')`,
    [connectionId, storeId],
  );
  const now = new Date();
  await app.get(MessagingService).receiveInboundMessage(storeId, {
    kind: 'facebook_page',
    externalAccountId: connectionId,
    externalMessageId: 'first',
    externalSenderId: 'sender-reply',
    content: 'দাম কত?',
    attachments: [],
    sentAt: now,
    receivedAt: now,
  });
  const { rows } = await admin.pool.query('select id from conversations where store_id = $1', [
    storeId,
  ]);
  return { storeId, conversationId: rows[0].id as string };
}

it('queues a staff reply once per operation key and reads the chat', async () => {
  const { storeId, conversationId } = await chatWithCustomer();
  const userId = randomUUID();
  await admin.pool.query("insert into users (id, name, email) values ($1, 'Staff', $2)", [
    userId,
    `${userId}@example.test`,
  ]);
  users.push(userId);
  const operationKey = randomUUID();
  const replies = app.get(ConversationReplyService);
  const first = await replies.reply(storeId, conversationId, userId, {
    body: 'Ji, 1300 taka',
    operationKey,
  });
  const again = await replies.reply(storeId, conversationId, userId, {
    body: 'Ji, 1300 taka',
    operationKey,
  });
  expect(again.messageId).toBe(first.messageId);
  const { rows } = await admin.pool.query(
    "select author_type, status, body from messages where store_id = $1 and direction = 'out'",
    [storeId],
  );
  expect(rows).toEqual([{ author_type: 'user', status: 'queued', body: 'Ji, 1300 taka' }]);

  const inbox = app.get(InboxService);
  expect((await inbox.get(storeId, conversationId)).unreadCount).toBe(1);
  expect((await inbox.markRead(storeId, conversationId)).unreadCount).toBe(0);
});

it('does not reply in a chat of another shop', async () => {
  const mine = await chatWithCustomer();
  const other = await chatWithCustomer();
  await expect(
    app.get(ConversationReplyService).reply(mine.storeId, other.conversationId, randomUUID(), {
      body: 'hello',
      operationKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
});

it('sends an uploaded photo on its own, and refuses one that does not match what was stored', async () => {
  const { storeId, conversationId } = await chatWithCustomer();
  const userId = randomUUID();
  await admin.pool.query("insert into users (id, name, email) values ($1, 'Staff', $2)", [
    userId,
    `${userId}@example.test`,
  ]);
  users.push(userId);
  const replies = app.get(ConversationReplyService);
  const bytes = new Uint8Array(1200).fill(7);
  const photo = { contentType: 'image/jpeg' as const, sizeBytes: bytes.byteLength };
  const { fileId, uploadUrl } = await replies.requestPhotoUpload(storeId, conversationId, photo);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: bytes,
    headers: { 'content-type': photo.contentType },
  });
  expect(put.ok).toBe(true);
  await expect(
    replies.reply(storeId, conversationId, userId, {
      body: '',
      operationKey: randomUUID(),
      photo: { ...photo, fileId, sizeBytes: 999 },
    }),
  ).rejects.toMatchObject({ code: 'CONVERSATION_PHOTO_INVALID' });

  await replies.reply(storeId, conversationId, userId, {
    body: '',
    operationKey: randomUUID(),
    photo: { ...photo, fileId },
  });
  const { rows } = await admin.pool.query(
    "select kind, body, attachments from messages where store_id = $1 and direction = 'out'",
    [storeId],
  );
  expect(rows).toMatchObject([
    {
      kind: 'image',
      body: '',
      attachments: [
        { kind: 'image', status: 'stored', objectKey: `stores/${storeId}/chat_photos/${fileId}` },
      ],
    },
  ]);
});
