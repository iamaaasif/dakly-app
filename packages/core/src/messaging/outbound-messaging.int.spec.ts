import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import { MetaRequestError } from '@dakly/providers/channel/channel-driver';
import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxRelayModule } from '../platform/outbox/outbox-relay.module';
import { OutboxRelayService } from '../platform/outbox/outbox-relay.service';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { SendMessageJob } from './jobs/send-message.job';
import { MessagingModule } from './messaging.module';
import { MessagingService, type OutgoingChannelMessage } from './messaging.service';
import { OutboundMessagingRepository } from './outbound-messaging.repository';

const f = new OwnerIsolationFixture();
const now = new Date('2026-11-19T03:00:00Z');
let app: INestApplicationContext;
let messaging: MessagingService;
let queue: Queue;

beforeAll(async () => {
  vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
  vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
  resetEnvForTests();
  await f.setup();
  await chatsEnabled(true);
  await f.connection.pool.query("update memberships set built_in_role = 'owner' where id = $1", [
    f.memberA,
  ]);
  class TestModule {}
  Module({
    imports: [
      DatabaseModule,
      MessagingModule,
      BullModule.forRoot({
        connection: toRedisConnection(loadEnv().REDIS_URL),
        prefix: `chat-2-test-${f.a}`,
      }),
      OutboxRelayModule,
    ],
    providers: [SendMessageJob],
  })(TestModule);
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  messaging = app.get(MessagingService);
  queue = app.get(getQueueToken(QUEUES.outbound));
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  try {
    await queue?.obliterate({ force: true });
    await app?.close();
    for (const table of [
      'notifications',
      'outbox_events',
      'messages',
      'conversations',
      'contact_identities',
    ])
      await f.connection.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [
        [f.a, f.b],
      ]);
  } finally {
    vi.unstubAllEnvs();
    resetEnvForTests();
    await f.close();
  }
});

async function queuedReply(
  actor: OutgoingChannelMessage['actor'] = { kind: 'ai', aiRunId: randomUUID() },
  category: OutgoingChannelMessage['category'] = 'staff_reply',
) {
  const storeId = f.a;
  vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  const connectionId = randomUUID();
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('fixture-page-credential'),
    );
  const { pool } = f.connection;
  await pool.query(
    `insert into channel_connections (id, store_id, kind, external_account_id, display_name,
      connected_at, access_token_ciphertext, key_version)
    values ($1::uuid, $2, 'facebook_page', $1::text, 'Send fixture', $3, $4, $5)`,
    [
      connectionId,
      storeId,
      new Date(now.getTime() - 4 * MINUTE_MS),
      secret.ciphertext,
      secret.keyVersion,
    ],
  );
  await expect(
    messaging.receiveInboundMessage(storeId, {
      kind: 'facebook_page',
      externalAccountId: connectionId,
      externalSenderId: 'sender-fixture',
      externalMessageId: 'inbound-fixture',
      content: 'দাম কত?',
      sentAt: now,
      receivedAt: now,
    }),
  ).resolves.toBe('stored');
  const {
    rows: [identity],
  } = await pool.query<{ id: string; contact_id: string }>(
    'select id, contact_id from contact_identities where store_id = $1 and channel_connection_id = $2',
    [storeId, connectionId],
  );
  const { messageId } = await messaging.send(storeId, {
    channel: 'messenger',
    connectionId,
    identityId: identity!.id,
    contactId: identity!.contact_id,
    category,
    content: 'জি, পণ্যটি আছে।',
    operationKey: randomUUID(),
    actor,
  });
  return { connectionId, messageId };
}

async function chatsEnabled(enabled: boolean) {
  await f.connection.pool.query('update stores set extensions = $1 where id = $2', [
    enabled ? ['chats'] : [],
    f.a,
  ]);
}

it('submits a queued reply once outside the database transaction', async () => {
  const { messageId } = await queuedReply();
  const calls: { inside: boolean; operationKey: string }[] = [];
  const transaction = app.get(StoreTransaction);
  vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockImplementation(async (_, message) => {
    calls.push({ inside: transaction.isOpen(), operationKey: message.operationKey });
    return { externalMessageId: `fake-${messageId}` };
  });
  await messaging.sendQueuedMessage(f.b, messageId);
  expect(await f.row('messages', messageId)).toMatchObject({ status: 'queued' });
  await app.get(OutboxRelayService).relay();
  const waiting = await queue.getWaiting();
  const job = waiting.find(({ data }) => data.payload.messageId === messageId);
  expect(job?.data).toMatchObject({ storeId: f.a, payload: { messageId } });
  const handler = app.get(SendMessageJob);
  await Promise.all([handler.handle(job!.data), handler.handle(job!.data)]);
  expect(calls).toEqual([{ inside: false, operationKey: messageId }]);
  expect(await f.row('messages', messageId)).toMatchObject({
    status: 'sent',
    external_id: `fake-${messageId}`,
  });
});

it('never submits twice if the worker lost its result after provider acceptance', async () => {
  const { messageId } = await queuedReply();
  const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockResolvedValue({
    externalMessageId: `fake-${messageId}`,
  });
  vi.spyOn(app.get(OutboundMessagingRepository), 'finish').mockRejectedValueOnce(
    new Error('Database connection lost'),
  );
  await expect(messaging.sendQueuedMessage(f.a, messageId)).rejects.toThrow(
    'Database connection lost',
  );
  await messaging.sendQueuedMessage(f.a, messageId);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(await f.row('messages', messageId)).toMatchObject({
    status: 'queued',
    error_code: 'send_unconfirmed',
  });
});

it('can retry a credential lookup failure before making a provider attempt', async () => {
  const { messageId } = await queuedReply();
  vi.spyOn(app.get(ChannelConnectionsService), 'prepareMetaSend').mockRejectedValueOnce(
    new Error('Credential lookup unavailable'),
  );
  const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockResolvedValue({
    externalMessageId: `fake-${messageId}`,
  });
  await expect(messaging.sendQueuedMessage(f.a, messageId)).rejects.toThrow(
    'Credential lookup unavailable',
  );
  expect(await f.row('messages', messageId)).toMatchObject({
    status: 'queued',
    error_code: null,
  });
  await messaging.sendQueuedMessage(f.a, messageId);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(await f.row('messages', messageId)).toMatchObject({ status: 'sent' });
});

it('keeps an uncertain send pending across a worker retry', async () => {
  const { messageId } = await queuedReply();
  const provider = vi
    .spyOn(FakeMetaChannelDriver.prototype, 'send')
    .mockRejectedValue(new MetaRequestError('unavailable'));
  await messaging.sendQueuedMessage(f.a, messageId);
  await messaging.sendQueuedMessage(f.a, messageId);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(await f.row('messages', messageId)).toMatchObject({
    status: 'queued',
    external_id: null,
    error_code: 'send_unconfirmed',
  });
});

it('fails the message and tells the owner when the provider rejects the credential', async () => {
  const { connectionId, messageId } = await queuedReply();
  vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockRejectedValue(
    new MetaRequestError('auth_error'),
  );
  await messaging.sendQueuedMessage(f.a, messageId);
  expect(await f.row('channel_connections', connectionId)).toMatchObject({
    status: 'needs_reconnect',
  });
  expect(await f.row('messages', messageId)).toMatchObject({ status: 'failed' });
  const notices = await f.connection.pool.query(
    'select type, user_id from notifications where store_id = $1',
    [f.a],
  );
  expect(notices.rows).toContainEqual({ type: 'channel.needs_reconnect', user_id: f.userA });
});

it('checks the reply window again at dispatch', async () => {
  const { messageId } = await queuedReply();
  vi.mocked(app.get(Clock).now).mockReturnValue(new Date(now.getTime() + DAY_MS));
  const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send');
  await messaging.sendQueuedMessage(f.a, messageId);
  expect(provider).not.toHaveBeenCalled();
  expect(await f.row('messages', messageId)).toMatchObject({
    status: 'failed',
    error_code: 'window_closed',
  });
});

it('uses the human-agent tag for a staff reply after the standard window', async () => {
  const { messageId } = await queuedReply({ kind: 'user', userId: f.userA });
  vi.mocked(app.get(Clock).now).mockReturnValue(new Date(now.getTime() + 2 * DAY_MS));
  const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockResolvedValue({
    externalMessageId: `fake-${messageId}`,
  });
  await messaging.sendQueuedMessage(f.a, messageId);
  expect(provider.mock.calls[0]?.[1].humanAgent).toBe(true);
  expect(await f.row('messages', messageId)).toMatchObject({ status: 'sent' });
});

it('fails an older outbound row without its chosen recipient', async () => {
  const { messageId } = await queuedReply();
  await f.connection.pool.query('update messages set recipient_identity_id = null where id = $1', [
    messageId,
  ]);
  const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send');
  await messaging.sendQueuedMessage(f.a, messageId);
  await messaging.sendQueuedMessage(f.a, messageId);
  expect(provider).not.toHaveBeenCalled();
  expect(await f.row('messages', messageId)).toMatchObject({
    status: 'failed',
    error_code: 'send_intent_missing',
  });
});

it('refuses queued inbox replies when Chats is disabled and sends core transactional messages', async () => {
  const reply = await queuedReply();
  const transactional = await queuedReply({ kind: 'system' }, 'transactional');
  const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockResolvedValue({
    externalMessageId: 'meta-test-transactional',
  });
  await chatsEnabled(false);
  try {
    await messaging.sendQueuedMessage(f.a, reply.messageId);
    await messaging.sendQueuedMessage(f.a, transactional.messageId);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await f.row('messages', reply.messageId)).toMatchObject({
      status: 'failed',
      error_code: 'chats_disabled',
    });
    expect(await f.row('messages', transactional.messageId)).toMatchObject({ status: 'sent' });
  } finally {
    await chatsEnabled(true);
  }
});
