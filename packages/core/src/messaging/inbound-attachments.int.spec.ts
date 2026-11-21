import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import {
  MetaRequestError,
  type ChannelDriver,
  type MediaDownload,
} from '@dakly/providers/channel/channel-driver';
import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { MINUTE_MS } from '../platform/time';
import { InboundAttachmentsModule } from './inbound-attachments.module';
import { InboundMediaReadingService } from './inbound-media-reading.service';
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
const sentAt = new Date('2026-11-19T03:00:00Z');
const stored = new Map<string, { bytes: Uint8Array; contentType: string }>();
let app: INestApplicationContext;
let download: ReturnType<typeof vi.fn<ChannelDriver['downloadMedia']>>;

beforeAll(async () => {
  vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
  vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
  vi.stubEnv('R2_ENDPOINT', 'http://127.0.0.1:1');
  vi.stubEnv('R2_BUCKET', 'unused');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'unused');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'unused');
  resetEnvForTests();
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  vi.spyOn(app.get<FileStorageDriver>(FILE_STORAGE_DRIVER), 'writeBytes').mockImplementation(
    async (key, bytes, contentType) => {
      stored.set(key, { bytes, contentType });
    },
  );
  download = vi.spyOn(FakeMetaChannelDriver.prototype, 'downloadMedia');
  // Reading has its own spec; these tests are about the copy.
  vi.spyOn(InboundMediaReadingService.prototype, 'read').mockResolvedValue();
});

beforeEach(() => {
  stored.clear();
  download.mockReset();
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'outbox_events',
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
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvForTests();
  }
});

async function shop() {
  const storeId = randomUUID();
  const connectionId = randomUUID();
  await admin.pool.query('insert into stores (id, name, extensions) values ($1, $2, $3)', [
    storeId,
    'Attachment test',
    [],
  ]);
  fixtures.push(storeId);
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('fake-rina-page-credential'),
    );
  await admin.pool.query(
    `insert into channel_connections
    (id, store_id, kind, external_account_id, display_name, connected_at, access_token_ciphertext, key_version)
    values ($1, $2, 'facebook_page', $6, 'Attachment test', $3, $4, $5)`,
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

function receive(
  { storeId, connectionId }: { storeId: string; connectionId: string },
  externalMessageId: string,
  input: { content: string | null; attachments: { kind: 'image' | 'voice'; sourceUrl: string }[] },
) {
  return app.get(MessagingService).receiveInboundMessage(storeId, {
    kind: 'facebook_page',
    externalAccountId: connectionId,
    externalSenderId: 'sender-test',
    externalMessageId,
    sentAt,
    receivedAt: sentAt,
    ...input,
  });
}

async function onlyMessage(storeId: string) {
  const { rows } = await admin.pool.query(
    'select id, kind, body, attachments from messages where store_id = $1',
    [storeId],
  );
  expect(rows).toHaveLength(1);
  return rows[0] as { id: string; kind: string; body: string | null; attachments: unknown };
}

const photo = { kind: 'image', sourceUrl: 'https://scontent.xx.fbcdn.net/photo' } as const;
const downloaded = (overrides: Partial<Extract<MediaDownload, { kind: 'downloaded' }>> = {}) =>
  ({
    kind: 'downloaded',
    bytes: new Uint8Array([1, 2, 3]),
    contentType: 'image/jpeg',
    ...overrides,
  }) satisfies MediaDownload;

it('saves an attachment-only message once when Meta delivers it twice', async () => {
  const shopA = await shop();
  const results = await Promise.all([
    receive(shopA, 'photo-1', { content: null, attachments: [photo] }),
    receive(shopA, 'photo-1', { content: null, attachments: [photo] }),
  ]);
  expect(results.sort()).toEqual(['duplicate', 'stored']);
  expect(await onlyMessage(shopA.storeId)).toMatchObject({
    kind: 'image',
    body: null,
    attachments: [{ kind: 'image', status: 'pending', sourceUrl: photo.sourceUrl }],
  });
  const events = await admin.pool.query(
    "select type from outbox_events where store_id = $1 and type = 'message.attachments_requested'",
    [shopA.storeId],
  );
  expect(events.rows).toHaveLength(1);
  const preview = await admin.pool.query(
    'select last_message_preview from conversations where store_id = $1',
    [shopA.storeId],
  );
  expect(preview.rows).toEqual([{ last_message_preview: 'Photo' }]);
});

it('keeps the text of a message that came with an attachment', async () => {
  const shopA = await shop();
  await receive(shopA, 'caption-1', { content: 'এই রংটা আছে?', attachments: [photo] });
  expect(await onlyMessage(shopA.storeId)).toMatchObject({
    kind: 'text',
    body: 'এই রংটা আছে?',
    attachments: [{ status: 'pending' }],
  });
});

it('copies the media once and does not download it again on a second run', async () => {
  const shopA = await shop();
  await receive(shopA, 'photo-2', { content: null, attachments: [photo] });
  const { id } = await onlyMessage(shopA.storeId);
  download.mockResolvedValue(downloaded());
  const job = app.get(CopyMessageAttachmentsJob);
  const data = {
    id: randomUUID(),
    type: 'message.attachments_requested',
    storeId: shopA.storeId,
    occurredAt: sentAt.toISOString(),
    payload: { messageId: id },
  };

  await job.handle(data, false);
  await job.handle(data, false);

  const key = `stores/${shopA.storeId}/messages/${id}/0`;
  expect(download).toHaveBeenCalledTimes(1);
  expect(download.mock.calls[0]?.slice(0, 2)).toEqual([
    'fake-rina-page-credential',
    photo.sourceUrl,
  ]);
  expect(stored.get(key)).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
  expect((await onlyMessage(shopA.storeId)).attachments).toEqual([
    { kind: 'image', status: 'stored', objectKey: key, contentType: 'image/jpeg', sizeBytes: 3 },
  ]);
});

it('retries once after a Meta outage and then stores the media', async () => {
  const shopA = await shop();
  await receive(shopA, 'photo-3', { content: null, attachments: [photo] });
  const { id } = await onlyMessage(shopA.storeId);
  download
    .mockRejectedValueOnce(new MetaRequestError('unavailable'))
    .mockResolvedValueOnce(downloaded());
  const job = app.get(CopyMessageAttachmentsJob);
  const data = {
    id: randomUUID(),
    type: 'message.attachments_requested',
    storeId: shopA.storeId,
    occurredAt: sentAt.toISOString(),
    payload: { messageId: id },
  };

  await expect(job.handle(data, false)).rejects.toMatchObject({
    code: 'ATTACHMENT_COPY_UNAVAILABLE',
  });
  expect((await onlyMessage(shopA.storeId)).attachments).toMatchObject([{ status: 'pending' }]);
  await job.handle(data, false);

  expect((await onlyMessage(shopA.storeId)).attachments).toMatchObject([{ status: 'stored' }]);
});

it('records the failure on the last attempt instead of retrying forever', async () => {
  const shopA = await shop();
  await receive(shopA, 'photo-4', { content: null, attachments: [photo] });
  const { id } = await onlyMessage(shopA.storeId);
  download.mockRejectedValue(new MetaRequestError('unavailable'));

  await app.get(CopyMessageAttachmentsJob).handle(
    {
      id: randomUUID(),
      type: 'message.attachments_requested',
      storeId: shopA.storeId,
      occurredAt: sentAt.toISOString(),
      payload: { messageId: id },
    },
    true,
  );

  expect((await onlyMessage(shopA.storeId)).attachments).toEqual([
    { kind: 'image', status: 'failed', reason: 'unavailable' },
  ]);
});

it.each([
  ['an expired link', { kind: 'expired' }, 'expired'],
  ['a file over the size limit', { kind: 'too_large' }, 'too_large'],
  ['a type that is not allowed', downloaded({ contentType: 'text/html' }), 'type_not_allowed'],
] as const)(
  'marks %s as failed with a reason and stores nothing',
  async (_name, result, reason) => {
    const shopA = await shop();
    await receive(shopA, `bad-${reason}`, { content: null, attachments: [photo] });
    const { id } = await onlyMessage(shopA.storeId);
    download.mockResolvedValue(result);

    await app.get(CopyMessageAttachmentsJob).handle(
      {
        id: randomUUID(),
        type: 'message.attachments_requested',
        storeId: shopA.storeId,
        occurredAt: sentAt.toISOString(),
        payload: { messageId: id },
      },
      false,
    );

    expect((await onlyMessage(shopA.storeId)).attachments).toEqual([
      { kind: 'image', status: 'failed', reason },
    ]);
    expect(stored.size).toBe(0);
  },
);

it("does not copy another store's message", async () => {
  const shopA = await shop();
  const shopB = await shop();
  await receive(shopA, 'photo-5', { content: null, attachments: [photo] });
  const { id } = await onlyMessage(shopA.storeId);
  download.mockResolvedValue(downloaded());

  await app.get(CopyMessageAttachmentsJob).handle(
    {
      id: randomUUID(),
      type: 'message.attachments_requested',
      storeId: shopB.storeId,
      occurredAt: sentAt.toISOString(),
      payload: { messageId: id },
    },
    false,
  );

  expect(download).not.toHaveBeenCalled();
  expect((await onlyMessage(shopA.storeId)).attachments).toMatchObject([{ status: 'pending' }]);
});
