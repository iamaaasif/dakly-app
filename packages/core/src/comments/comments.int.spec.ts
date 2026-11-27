import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { MetaRequestError } from '@dakly/providers/channel/channel-driver';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { CommentsModule } from './comments.module';
import { CommentsService, type ReceiveCommentInput } from './comments.service';

class TestModule {}
Module({ imports: [DatabaseModule, CommentsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const fixtures: string[] = [];
const now = new Date('2026-11-19T03:00:00Z');
const staff = randomUUID();
let app: INestApplicationContext;
let comments: CommentsService;
let connections: ChannelConnectionsService;

beforeAll(async () => {
  vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
  vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
  resetEnvForTests();
  await admin.pool.query("insert into users (id, name, email) values ($1, 'Comments staff', $2)", [
    staff,
    `${staff}@example.test`,
  ]);
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  comments = app.get(CommentsService);
  connections = app.get(ChannelConnectionsService);
});

async function clean() {
  for (const table of ['audit_log', 'outbox_events', 'social_comments', 'channel_connections'])
    await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [fixtures]);
}

// A Page belongs to one shop at a time, so each test starts without the last test's connection.
afterEach(async () => {
  vi.restoreAllMocks();
  await clean();
});

afterAll(async () => {
  try {
    await app?.close();
    await clean();
    await admin.pool.query('delete from users where id = $1', [staff]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [fixtures]);
  } finally {
    vi.unstubAllEnvs();
    resetEnvForTests();
    await admin.pool.end();
  }
});

// The fake Meta driver only accepts the Page it lists, with that Page's credential.
async function shop(extensions = ['chats'], connected = true) {
  vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  const storeId = randomUUID();
  await admin.pool.query('insert into stores (id, name, extensions) values ($1, $2, $3)', [
    storeId,
    'Comments test',
    extensions,
  ]);
  fixtures.push(storeId);
  if (!connected) return storeId;
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('fake-rina-page-credential'),
    );
  await admin.pool.query(
    `insert into channel_connections (id, store_id, kind, external_account_id, display_name,
      connected_at, access_token_ciphertext, key_version)
    values ($1, $2, 'facebook_page', '1001001', 'Comments test', $3, $4, $5)`,
    [
      randomUUID(),
      storeId,
      new Date(now.getTime() - 10 * MINUTE_MS),
      secret.ciphertext,
      secret.keyVersion,
    ],
  );
  return storeId;
}

function incoming(externalCommentId: string, overrides: Partial<ReceiveCommentInput> = {}) {
  return {
    kind: 'facebook_page',
    externalAccountId: '1001001',
    externalPostId: 'post-1',
    externalCommentId,
    parentExternalCommentId: null,
    authorExternalId: 'author-1',
    authorName: 'Sadia Islam',
    text: 'Price koto?',
    commentedAt: now,
    receivedAt: now,
    ...overrides,
  } satisfies ReceiveCommentInput;
}

async function stored(storeId: string, externalCommentId: string, overrides = {}) {
  await expect(comments.receive(storeId, incoming(externalCommentId, overrides))).resolves.toBe(
    'stored',
  );
  const { items } = await comments.list(storeId, { limit: 100 });
  return items.find((item) => item.body !== null && item.externalPostId === 'post-1')!;
}

it('stores a comment once and keeps it out of other shops', async () => {
  const storeId = await shop();
  const otherStore = await shop(['chats'], false);
  const input = incoming('c-1');
  expect(await comments.receive(otherStore, { ...input, externalAccountId: 'unknown' })).toBe(
    'unknown_account',
  );
  const outcomes = await Promise.all([
    comments.receive(storeId, input),
    comments.receive(storeId, input),
  ]);
  expect(outcomes.sort()).toEqual(['duplicate', 'stored']);
  const { items } = await comments.list(storeId, { limit: 50 });
  expect(items).toEqual([
    expect.objectContaining({
      channel: 'messenger',
      authorName: 'Sadia Islam',
      body: 'Price koto?',
      status: 'new',
      isReply: false,
      canReplyPrivately: true,
    }),
  ]);
  expect((await comments.list(otherStore, { limit: 50 })).items).toEqual([]);
  const { rows } = await admin.pool.query(
    "select payload from outbox_events where store_id = $1 and type = 'comment.received'",
    [storeId],
  );
  expect(rows).toEqual([{ payload: { commentId: items[0]?.id } }]);
  await expect(
    comments.replyPublicly(otherStore, staff, items[0]!.id, { body: 'Inbox e dilam' }),
  ).rejects.toMatchObject({ code: 'COMMENT_NOT_FOUND' });
});

it('ignores a comment from before the Page connected and one dated in the future', async () => {
  const storeId = await shop();
  const old = new Date(now.getTime() - 20 * MINUTE_MS);
  expect(await comments.receive(storeId, incoming('old', { commentedAt: old }))).toBe(
    'stale_delivery',
  );
  const future = new Date(now.getTime() + 5 * MINUTE_MS);
  expect(await comments.receive(storeId, incoming('future', { commentedAt: future }))).toBe(
    'invalid_timestamp',
  );
});

it('replies publicly once and marks the comment replied', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-public');
  const replied = await comments.replyPublicly(storeId, staff, comment.id, {
    body: 'ইনবক্সে দাম জানিয়ে দিয়েছি',
  });
  expect(replied).toMatchObject({ status: 'replied', publicReplied: true });
  await expect(
    comments.replyPublicly(storeId, staff, comment.id, { body: 'Again' }),
  ).rejects.toMatchObject({ code: 'COMMENT_ALREADY_REPLIED' });
});

it('posts one public reply when two staff press at once, and frees it after a refusal', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-public-race');
  const reply = vi.spyOn(connections, 'replyToMetaComment');
  const results = await Promise.allSettled([
    comments.replyPublicly(storeId, staff, comment.id, { body: 'Inbox e dilam' }),
    comments.replyPublicly(storeId, staff, comment.id, { body: 'Inbox e dilam' }),
  ]);
  expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(reply).toHaveBeenCalledTimes(1);
  const other = await stored(storeId, 'c-public-refused');
  reply.mockRejectedValueOnce(new MetaRequestError('rejected'));
  await expect(
    comments.replyPublicly(storeId, staff, other.id, { body: 'Try' }),
  ).rejects.toMatchObject({ code: 'COMMENT_REJECTED' });
  await expect(
    comments.replyPublicly(storeId, staff, other.id, { body: 'Try again' }),
  ).resolves.toMatchObject({ publicReplied: true });
});

it('sends one private reply per comment even when two staff press at once', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-private');
  const send = vi.spyOn(connections, 'sendMetaPrivateReply');
  const results = await Promise.allSettled([
    comments.replyPrivately(storeId, staff, comment.id, { body: 'Price 850 taka' }),
    comments.replyPrivately(storeId, staff, comment.id, { body: 'Price 850 taka' }),
  ]);
  expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(send).toHaveBeenCalledTimes(1);
  await expect(
    comments.replyPrivately(storeId, staff, comment.id, { body: 'Again' }),
  ).rejects.toMatchObject({ code: 'COMMENT_PRIVATE_REPLY_USED' });
  const { items } = await comments.list(storeId, { limit: 50 });
  expect(items[0]).toMatchObject({ status: 'replied', canReplyPrivately: false });
});

it('refuses a private reply after Meta’s 7 days', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-late');
  vi.spyOn(app.get(Clock), 'now').mockReturnValue(new Date(now.getTime() + 7 * DAY_MS + 1));
  await expect(
    comments.replyPrivately(storeId, staff, comment.id, { body: 'Late' }),
  ).rejects.toMatchObject({ code: 'COMMENT_PRIVATE_REPLY_EXPIRED' });
});

it('frees the private reply after a refusal but not after an outage', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-refused');
  const send = vi.spyOn(connections, 'sendMetaPrivateReply');
  send.mockRejectedValueOnce(new MetaRequestError('rejected'));
  await expect(
    comments.replyPrivately(storeId, staff, comment.id, { body: 'Try' }),
  ).rejects.toMatchObject({ code: 'COMMENT_REJECTED' });
  send.mockRejectedValueOnce(new MetaRequestError('unavailable'));
  await expect(
    comments.replyPrivately(storeId, staff, comment.id, { body: 'Try' }),
  ).rejects.toMatchObject({ code: 'COMMENT_UNCONFIRMED' });
  await expect(
    comments.replyPrivately(storeId, staff, comment.id, { body: 'Try' }),
  ).rejects.toMatchObject({ code: 'COMMENT_PRIVATE_REPLY_USED' });
});

it('hides and unhides idempotently', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-hide');
  const hide = vi.spyOn(connections, 'setMetaCommentHidden');
  expect(await comments.setHidden(storeId, staff, comment.id, true)).toMatchObject({
    status: 'hidden',
  });
  expect(await comments.setHidden(storeId, staff, comment.id, true)).toMatchObject({
    status: 'hidden',
  });
  expect(hide).toHaveBeenCalledTimes(1);
  expect(await comments.setHidden(storeId, staff, comment.id, false)).toMatchObject({
    status: 'new',
  });
  expect(hide).toHaveBeenCalledTimes(2);
});

it('keeps comments closed while Chats is off', async () => {
  const storeId = await shop([]);
  await expect(comments.list(storeId, { limit: 10 })).rejects.toMatchObject({
    code: 'CHATS_DISABLED',
  });
});

const stillAllowed = async () => true;

it('automatically replies once even when the comment job is delivered twice', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-auto');
  const sendPrivate = vi.spyOn(connections, 'sendMetaPrivateReply');
  const sendPublic = vi.spyOn(connections, 'replyToMetaComment');
  const reply = {
    privateBody: 'Blue Kurti costs ৳1,200.',
    publicBody: 'I sent the price in Messenger.',
    stillAllowed,
  };
  await Promise.all([
    comments.replyAutomatically(storeId, comment.id, reply),
    comments.replyAutomatically(storeId, comment.id, reply),
  ]);
  const { items } = await comments.list(storeId, { limit: 50 });
  expect(items).toMatchObject([
    { status: 'replied', publicReplied: true, canReplyPrivately: false },
  ]);
  expect(sendPrivate.mock.calls.map(([, payload]) => payload.text)).toEqual([reply.privateBody]);
  expect(sendPublic.mock.calls.map(([, payload]) => payload.text)).toEqual([reply.publicBody]);
});

it.each(['unavailable', 'invalid_response'] as const)(
  'leaves the public reply available when the private send is unconfirmed (%s)',
  async (errorCode) => {
    const storeId = await shop();
    const comment = await stored(storeId, 'c-auto-private-unconfirmed');
    vi.spyOn(connections, 'sendMetaPrivateReply').mockRejectedValueOnce(
      new MetaRequestError(errorCode),
    );
    const reply = {
      privateBody: 'Blue Kurti costs ৳1,200.',
      publicBody: 'I sent the price in Messenger.',
      stillAllowed,
    };
    await expect(comments.replyAutomatically(storeId, comment.id, reply)).rejects.toMatchObject({
      code: 'COMMENT_UNCONFIRMED',
    });
    await comments.replyAutomatically(storeId, comment.id, reply);
    const { items } = await comments.list(storeId, { limit: 50 });
    expect(items).toMatchObject([
      { status: 'new', publicReplied: false, canReplyPrivately: false },
    ]);
  },
);

it('retries a refused public reply without sending the confirmed private reply again', async () => {
  const storeId = await shop();
  const comment = await stored(storeId, 'c-auto-public-refused');
  const sendPrivate = vi.spyOn(connections, 'sendMetaPrivateReply');
  const sendPublic = vi.spyOn(connections, 'replyToMetaComment');
  sendPublic.mockRejectedValueOnce(new MetaRequestError('rejected'));
  const reply = {
    privateBody: 'Blue Kurti costs ৳1,200.',
    publicBody: 'I sent the price in Messenger.',
    stillAllowed,
  };
  await expect(comments.replyAutomatically(storeId, comment.id, reply)).rejects.toMatchObject({
    code: 'COMMENT_REJECTED',
  });
  await comments.replyAutomatically(storeId, comment.id, {
    publicBody: reply.publicBody,
    stillAllowed,
  });
  expect(sendPrivate).toHaveBeenCalledTimes(1);
  const { items } = await comments.list(storeId, { limit: 50 });
  expect(items).toMatchObject([{ status: 'replied', publicReplied: true }]);
});
