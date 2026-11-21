import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import { LlmError } from '@dakly/providers/llm/llm-driver';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { MINUTE_MS } from '../platform/time';
import { InboundAttachmentsModule } from './inbound-attachments.module';
import { CopyMessageAttachmentsJob } from './jobs/copy-message-attachments.job';
import { MessagingModule } from './messaging.module';
import { MessagingService } from './messaging.service';

class TestModule {}
Module({
  imports: [DatabaseModule, MessagingModule, InboundAttachmentsModule],
  providers: [CopyMessageAttachmentsJob],
})(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const fixtures: string[] = [];
const plans: string[] = [];
const sentAt = new Date('2026-11-19T03:00:00Z');
const usage = { inputTokens: 900, cachedInputTokens: 0, outputTokens: 60 };
const reading = {
  subject: 'product',
  description: 'A red cotton saree with a golden border.',
  searchWords: ['saree', 'শাড়ি', 'red', 'লাল', 'cotton'],
  visibleText: '',
};
let app: INestApplicationContext;
let respond: ReturnType<typeof vi.spyOn<FakeLlmDriver, 'respond'>>;
let transcribe: ReturnType<typeof vi.spyOn<FakeLlmDriver, 'transcribe'>>;
let download: ReturnType<typeof vi.spyOn<FakeMetaChannelDriver, 'downloadMedia'>>;
const files = new Map<string, Uint8Array>();

beforeAll(async () => {
  vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
  vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
  vi.stubEnv('R2_ENDPOINT', 'http://127.0.0.1:1');
  vi.stubEnv('R2_BUCKET', 'unused');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'unused');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'unused');
  resetEnvForTests();
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  const storage = app.get<FileStorageDriver>(FILE_STORAGE_DRIVER);
  vi.spyOn(storage, 'writeBytes').mockImplementation(async (key, bytes) => {
    files.set(key, bytes);
  });
  vi.spyOn(storage, 'readBytes').mockImplementation(async (key) => {
    const bytes = files.get(key);
    return bytes ? { kind: 'found', bytes } : { kind: 'missing' };
  });
  download = vi.spyOn(FakeMetaChannelDriver.prototype, 'downloadMedia');
  respond = vi.spyOn(FakeLlmDriver.prototype, 'respond');
  transcribe = vi.spyOn(FakeLlmDriver.prototype, 'transcribe');
});

beforeEach(() => {
  files.clear();
  download.mockReset();
  respond.mockReset();
  transcribe.mockReset();
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'ai_runs',
      'usage_events',
      'subscriptions',
      'outbox_events',
      'messages',
      'conversations',
      'contact_identities',
      'contacts',
      'channel_connections',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [fixtures]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [fixtures]);
    await admin.pool.query('delete from plans where id = any($1::uuid[])', [plans]);
  } finally {
    await admin.pool.end();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvForTests();
  }
});

async function shop(allowance = 100) {
  const storeId = randomUUID();
  const planId = randomUUID();
  const connectionId = randomUUID();
  await admin.pool.query('insert into stores (id, name, extensions) values ($1, $2, $3)', [
    storeId,
    'Media reading test',
    [],
  ]);
  fixtures.push(storeId);
  plans.push(planId);
  await admin.pool.query(
    "insert into plans (id, code, name, monthly_price_poisha, yearly_price_poisha, limits, is_public) values ($1::uuid, $1::text, 'Media fixture', 0, 0, $2, false)",
    [planId, { ai_conversation: allowance }],
  );
  await admin.pool.query(
    "insert into subscriptions (id, store_id, plan_id, status, current_period_price_poisha, current_period_start, current_period_end) values (gen_random_uuid(), $1, $2, 'active', 0, now(), now() + interval '1 month')",
    [storeId, planId],
  );
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('fake-rina-page-credential'),
    );
  await admin.pool.query(
    `insert into channel_connections
    (id, store_id, kind, external_account_id, display_name, connected_at, access_token_ciphertext, key_version)
    values ($1, $2, 'facebook_page', $6, 'Media reading test', $3, $4, $5)`,
    [
      connectionId,
      storeId,
      new Date(sentAt.getTime() - 2 * MINUTE_MS),
      secret.ciphertext,
      secret.keyVersion,
      connectionId,
    ],
  );
  return { storeId, connectionId };
}

async function receive(
  { storeId, connectionId }: { storeId: string; connectionId: string },
  content: string | null,
  attachment: { kind: 'image' | 'voice'; sourceUrl: string },
) {
  await app.get(MessagingService).receiveInboundMessage(storeId, {
    kind: 'facebook_page',
    externalAccountId: connectionId,
    externalSenderId: 'sender-test',
    externalMessageId: randomUUID(),
    sentAt,
    receivedAt: sentAt,
    content,
    attachments: [attachment],
  });
  const { rows } = await admin.pool.query('select id from messages where store_id = $1', [storeId]);
  return (rows[0] as { id: string }).id;
}

const photo = { kind: 'image', sourceUrl: 'https://scontent.xx.fbcdn.net/photo' } as const;
const voice = { kind: 'voice', sourceUrl: 'https://cdn.fbsbx.com/voice' } as const;

function run(storeId: string, messageId: string, finalAttempt = false) {
  return app.get(CopyMessageAttachmentsJob).handle(
    {
      id: randomUUID(),
      type: 'message.attachments_requested',
      storeId,
      occurredAt: sentAt.toISOString(),
      payload: { messageId },
    },
    finalAttempt,
  );
}

async function messageRow(messageId: string) {
  const { rows } = await admin.pool.query(
    'select media_text, attachments from messages where id = $1',
    [messageId],
  );
  return rows[0] as { media_text: string | null; attachments: { read?: string }[] };
}

async function aiRuns(storeId: string) {
  const { rows } = await admin.pool.query(
    'select tier, purpose, outcome from ai_runs where store_id = $1 order by created_at',
    [storeId],
  );
  return rows;
}

const downloaded = (contentType: string) =>
  ({ kind: 'downloaded', bytes: new Uint8Array([1, 2, 3]), contentType }) as const;

async function usageRows(storeId: string) {
  const { rows } = await admin.pool.query(
    'select unit, quantity from usage_events where store_id = $1',
    [storeId],
  );
  return rows;
}

it('describes a customer photo for a product search and reads it only once', async () => {
  const shopA = await shop();
  const id = await receive(shopA, 'এইটা আছে?', photo);
  download.mockResolvedValue(downloaded('image/jpeg'));
  respond.mockResolvedValue({
    kind: 'output',
    output: reading,
    usage,
    model: 'fake',
    responseId: 'r1',
  });

  await run(shopA.storeId, id);
  await run(shopA.storeId, id);

  expect(respond).toHaveBeenCalledTimes(1);
  expect(respond.mock.calls[0]?.[0].images).toEqual([
    { contentType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) },
  ]);
  expect(await messageRow(id)).toMatchObject({
    media_text:
      'Photo: A red cotton saree with a golden border.\nSearch words: saree, শাড়ি, red, লাল, cotton',
    attachments: [{ status: 'stored', read: 'done' }],
  });
  expect(await aiRuns(shopA.storeId)).toEqual([
    { tier: 'vision', purpose: 'describe_image', outcome: 'completed' },
  ]);
  expect(await usageRows(shopA.storeId)).toEqual([{ unit: 'ai_conversation', quantity: 1 }]);
});

it('labels a payment screenshot and keeps the transaction id it shows', async () => {
  const shopA = await shop();
  const id = await receive(shopA, null, photo);
  download.mockResolvedValue(downloaded('image/png'));
  respond.mockResolvedValue({
    kind: 'output',
    output: {
      subject: 'payment_screenshot',
      description: 'A bKash payment confirmation.',
      searchWords: [],
      visibleText: 'TrxID 9K3L2M1N, Tk 1,250',
    },
    usage,
    model: 'fake',
    responseId: 'r2',
  });

  await run(shopA.storeId, id);

  expect((await messageRow(id)).media_text).toBe(
    'Payment screenshot: A bKash payment confirmation.\nText in photo: TrxID 9K3L2M1N, Tk 1,250',
  );
});

it('transcribes a Banglish voice note onto the message', async () => {
  const shopA = await shop();
  const id = await receive(shopA, null, voice);
  download.mockResolvedValue(downloaded('audio/ogg'));
  transcribe.mockResolvedValue({
    model: 'fake',
    text: 'ভাইয়া ei red saree ta ki stock e ache? COD hobe?',
    usage,
  });

  await run(shopA.storeId, id);

  expect(transcribe.mock.calls[0]?.[0].hint).toContain('Banglish');
  expect(await messageRow(id)).toMatchObject({
    media_text: 'Voice note: ভাইয়া ei red saree ta ki stock e ache? COD hobe?',
    attachments: [{ read: 'done' }],
  });
  expect(await aiRuns(shopA.storeId)).toEqual([
    { tier: 'transcribe', purpose: 'transcribe', outcome: 'completed' },
  ]);
  expect(await usageRows(shopA.storeId)).toEqual([{ unit: 'ai_conversation', quantity: 1 }]);
});

it('does not read or bill a voice note when the allowance is used up', async () => {
  const shopA = await shop(0);
  const id = await receive(shopA, null, voice);
  download.mockResolvedValue(downloaded('audio/ogg'));

  await run(shopA.storeId, id);

  expect(transcribe).not.toHaveBeenCalled();
  expect(await messageRow(id)).toMatchObject({
    media_text: null,
    attachments: [{ read: 'failed' }],
  });
  expect(await usageRows(shopA.storeId)).toEqual([]);
});

it('bills nothing when the model fails', async () => {
  const shopA = await shop();
  const id = await receive(shopA, null, voice);
  download.mockResolvedValue(downloaded('audio/ogg'));
  transcribe.mockRejectedValue(new LlmError('LLM_REQUEST_FAILED'));

  await run(shopA.storeId, id, true);

  expect(await usageRows(shopA.storeId)).toEqual([]);
  await app.get(ValkeyClient).connection.del(`${loadEnv().QUEUE_PREFIX}:{ai}:errors`);
});

it('retries after a model outage, then gives up on the last attempt', async () => {
  const shopA = await shop();
  const id = await receive(shopA, null, voice);
  download.mockResolvedValue(downloaded('audio/ogg'));
  transcribe.mockRejectedValue(new LlmError('LLM_UNAVAILABLE'));

  await expect(run(shopA.storeId, id)).rejects.toMatchObject({
    code: 'MEDIA_READING_UNAVAILABLE',
  });
  expect((await messageRow(id)).attachments).toMatchObject([{ status: 'stored' }]);
  expect((await messageRow(id)).attachments[0]?.read).toBeUndefined();

  await run(shopA.storeId, id, true);
  expect(await messageRow(id)).toMatchObject({
    media_text: null,
    attachments: [{ read: 'failed' }],
  });
  // The outages count toward the shared AI pause; other specs must not inherit them.
  await app.get(ValkeyClient).connection.del(`${loadEnv().QUEUE_PREFIX}:{ai}:errors`);
});

it('leaves another shop’s message unread', async () => {
  const shopA = await shop();
  const shopB = await shop();
  const id = await receive(shopB, null, voice);
  download.mockResolvedValue(downloaded('audio/ogg'));

  await run(shopA.storeId, id);

  expect(transcribe).not.toHaveBeenCalled();
  expect(await messageRow(id)).toMatchObject({
    media_text: null,
    attachments: [{ status: 'pending' }],
  });
});
