import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import { FakeMetaPublishingDriver } from '@dakly/providers/social/meta/fake-meta-publishing-driver';
import { MetaPublishingError } from '@dakly/providers/social/meta-publishing-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { AuditService } from '../audit/audit.service';
import type { ChannelConnectionsService } from '../channels/channel-connections.service';
import { loadEnv } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import type { StoresService } from '../stores/stores.service';
import { SocialPublishingService } from './social-publishing.service';
import { SocialRepository } from './social.repository';

describe('SocialPublishingService', () => {
  const fixture = new OwnerIsolationFixture();
  const now = new Date('2026-11-20T06:00:00Z');
  const encryption = new EnvelopeEncryption(loadEnv().encryption);
  beforeAll(() => fixture.setup());
  afterAll(() => fixture.close());

  function publishing(
    driver = new FakeMetaPublishingDriver(),
    expiresAt = new Date(now.getTime() + DAY_MS),
  ) {
    const clock = { now: vi.fn(() => now) };
    const secret = encryption.encrypt(
      { owner: 'store', storeId: fixture.a, purpose: 'channel-access-token' },
      Buffer.from('fake-page-token'),
    );
    const accounts = new Map<string, 'facebook_page' | 'instagram'>();
    const postingCredential = vi.fn(async (_storeId: string, channelConnectionId: string) => {
      const kind = accounts.get(channelConnectionId);
      return kind && { ...secret, expiresAt, kind, externalAccountId: channelConnectionId };
    });
    const recordRejectedToken = vi.fn(async (_storeId: string, channelConnectionId: string) => {
      accounts.delete(channelConnectionId);
    });
    const repository = new SocialRepository(fixture.tenant);
    const storage = {
      getObjectMetadata: vi.fn<FileStorageDriver['getObjectMetadata']>(async () => ({
        contentType: 'image/jpeg',
        sizeBytes: 42,
      })),
      createDownloadUrl: vi.fn(() => 'https://storage.test/photo.jpg'),
    };
    const isActive = vi.fn(async () => true);
    const stores = { isActive } as unknown as StoresService;
    const publish = vi.fn();
    const record = vi.fn();
    const service = new SocialPublishingService(
      repository,
      { postingCredential, recordRejectedToken } as unknown as ChannelConnectionsService,
      storage,
      driver,
      encryption,
      new StoreTransaction(fixture.tenant),
      { record } as unknown as AuditService,
      { publish } as unknown as OutboxService,
      clock,
      stores,
    );
    return {
      service,
      accounts,
      publish,
      record,
      storage,
      postingCredential,
      recordRejectedToken,
      clock,
      isActive,
    };
  }

  async function setupTarget(
    accounts: Map<string, 'facebook_page' | 'instagram'>,
    kind: 'facebook_page' | 'instagram',
    postId: string,
    deadline = now,
  ) {
    const channel = randomUUID();
    const target = randomUUID();
    await fixture.connection.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1::uuid,$2,$3,$1::text,'রিনার পেজ')",
      [channel, fixture.a, kind],
    );
    await fixture.connection.pool.query(
      "insert into post_targets (id,store_id,post_id,channel_connection_id,status,scheduled_for,caption_override) values($1,$2,$3,$4,'scheduled',$5,$6)",
      [
        target,
        fixture.a,
        postId,
        channel,
        deadline,
        kind === 'instagram' ? '' : 'Facebook caption',
      ],
    );
    accounts.set(channel, kind);
    return { postTargetId: target, scheduledFor: deadline.toISOString() };
  }

  async function post(firstComment: string | null = null) {
    const postId = randomUUID();
    const fileId = randomUUID();
    await fixture.connection.pool.query(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status) values($1::uuid,$2,'post_media',$1::text,'image/jpeg',42,'ready')",
      [fileId, fixture.a],
    );
    await fixture.connection.pool.query(
      "insert into posts(id,store_id,caption,media_file_ids,created_by_user_id,first_comment) values($1,$2,'Common caption',$3,$4,$5)",
      [postId, fixture.a, [fileId], fixture.userA, firstComment],
    );
    return postId;
  }

  it('publishes Facebook while Instagram fails after three retries on the same post', async () => {
    const driver = new FakeMetaPublishingDriver();
    const facebook = vi.spyOn(driver, 'publishFacebook');
    const instagram = vi
      .spyOn(driver, 'publishInstagram')
      .mockRejectedValueOnce(new MetaPublishingError('retryable'))
      .mockRejectedValue(new MetaPublishingError('rejected'));
    const { service, accounts, publish, clock } = publishing(driver);
    const postId = await post();
    const page = await setupTarget(accounts, 'facebook_page', postId);
    const ig = await setupTarget(accounts, 'instagram', postId);
    await service.publishTarget(fixture.a, page, false);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      clock.now.mockReturnValue(new Date(now.getTime() + attempt * 5 * MINUTE_MS));
      await expect(service.publishTarget(fixture.a, ig, false)).rejects.toThrow();
    }
    clock.now.mockReturnValue(new Date(now.getTime() + 15 * MINUTE_MS));
    await service.publishTarget(fixture.a, ig, true);
    expect(await fixture.row('post_targets', page.postTargetId)).toMatchObject({
      status: 'published',
      external_post_id: expect.stringContaining('fake-facebook'),
      attempts: 1,
    });
    expect(await fixture.row('post_targets', ig.postTargetId)).toMatchObject({
      status: 'failed',
      attempts: 4,
    });
    expect(facebook).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'fake-page-token' }),
      expect.objectContaining({ caption: 'Facebook caption' }),
      expect.any(Array),
    );
    expect(instagram).toHaveBeenCalledTimes(4);
    expect(publish.mock.calls.map(([event]) => event.type)).toEqual([
      'post.published',
      'post.failed',
    ]);
  });

  it('does not publish twice when Instagram accepted the post before its response was lost', async () => {
    const driver = new FakeMetaPublishingDriver();
    const performPublish = driver.publishInstagram.bind(driver);
    const publish = vi
      .spyOn(driver, 'publishInstagram')
      .mockImplementationOnce(async (account, container) => {
        await performPublish(account, container);
        throw new MetaPublishingError('unavailable');
      });
    const create = vi.spyOn(driver, 'createInstagramContainer');
    const { service, accounts, clock } = publishing(driver);
    const target = await setupTarget(accounts, 'instagram', await post());
    await expect(service.publishTarget(fixture.a, target, false)).rejects.toThrow();
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'publishing',
    });
    clock.now.mockReturnValue(new Date(now.getTime() + 5 * MINUTE_MS));
    await service.publishTarget(fixture.a, target, false);
    await service.publishTarget(fixture.a, target, false);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'published',
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps the first delivery’s success when a duplicate arrives during photo upload', async () => {
    const driver = new FakeMetaPublishingDriver();
    const reply = Promise.withResolvers<string[]>();
    const preparing = Promise.withResolvers<void>();
    const upload = vi.spyOn(driver, 'uploadFacebookPhotos').mockImplementationOnce(() => {
      preparing.resolve();
      return reply.promise;
    });
    const send = vi.spyOn(driver, 'publishFacebook');
    const { service, accounts } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    const first = service.publishTarget(fixture.a, target, false);
    await Promise.race([preparing.promise, first]);
    try {
      await expect(service.publishTarget(fixture.a, target, false)).rejects.toThrow(
        'Check the account',
      );
    } finally {
      reply.resolve(['photo']);
      await first;
    }
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'published',
      attempts: 1,
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('records the confirmed result after an event write fails without publishing again', async () => {
    const driver = new FakeMetaPublishingDriver();
    const send = vi.spyOn(driver, 'publishFacebook');
    const { service, accounts, publish } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    publish.mockRejectedValueOnce(new Error('Cannot write event'));
    await expect(service.publishTarget(fixture.a, target, true)).rejects.toThrow(
      'Cannot write event',
    );
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'publishing',
      external_post_id: expect.stringContaining('fake-facebook'),
    });
    await service.publishTarget(fixture.a, target, true);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'published',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends the first comment only to Instagram when the post goes to both accounts', async () => {
    const driver = new FakeMetaPublishingDriver();
    const comment = vi.spyOn(driver, 'comment');
    const { service, accounts } = publishing(driver);
    const postId = await post('ইনস্টাগ্রাম');
    const page = await setupTarget(accounts, 'facebook_page', postId);
    const instagram = await setupTarget(accounts, 'instagram', postId);
    await service.publishTarget(fixture.a, page, true);
    await service.publishTarget(fixture.a, instagram, true);
    expect(comment).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessToken: 'fake-page-token' }),
      expect.stringContaining('fake-instagram'),
      'ইনস্টাগ্রাম',
    );
  });

  it('does not publish after the page disconnects while its photos are uploading', async () => {
    const driver = new FakeMetaPublishingDriver();
    const send = vi.spyOn(driver, 'publishFacebook');
    const { service, accounts } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    vi.spyOn(driver, 'uploadFacebookPhotos').mockImplementationOnce(async () => {
      accounts.clear();
      return ['photo'];
    });
    await service.publishTarget(fixture.a, target, true);
    expect(send).not.toHaveBeenCalled();
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'failed',
      error_code: 'POST_TOKEN_EXPIRED',
    });
  });

  it('keeps the post published without commenting after its Instagram account disconnects', async () => {
    const driver = new FakeMetaPublishingDriver();
    const comment = vi.spyOn(driver, 'comment');
    const { service, accounts } = publishing(driver);
    const postId = await post('ইনস্টাগ্রাম');
    const target = await setupTarget(accounts, 'instagram', postId);
    vi.spyOn(driver, 'publishInstagram').mockImplementationOnce(async () => {
      accounts.clear();
      return 'published-post';
    });
    await service.publishTarget(fixture.a, target, true);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'published',
      error_code: 'POST_COMMENT_UNCONFIRMED',
    });
    expect(comment).not.toHaveBeenCalled();
  });

  it('sends the first comment once when the publication event needs a retry', async () => {
    const driver = new FakeMetaPublishingDriver();
    const comment = vi.spyOn(driver, 'comment');
    const { service, accounts, publish } = publishing(driver);
    const postId = await post('ইনস্টাগ্রাম');
    const target = await setupTarget(accounts, 'instagram', postId);
    publish.mockRejectedValueOnce(new Error('Cannot write event'));
    await expect(service.publishTarget(fixture.a, target, true)).rejects.toThrow(
      'Cannot write event',
    );
    await service.publishTarget(fixture.a, target, true);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'published',
      error_code: null,
    });
    expect(comment).toHaveBeenCalledTimes(1);
  });

  it('keeps the first comment result when a duplicate job arrives while it is sending', async () => {
    const driver = new FakeMetaPublishingDriver();
    const entered = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<void>();
    const comment = vi.spyOn(driver, 'comment').mockImplementationOnce(() => {
      entered.resolve();
      return reply.promise;
    });
    const { service, accounts } = publishing(driver);
    const target = await setupTarget(accounts, 'instagram', await post('ইনস্টাগ্রাম'));
    const first = service.publishTarget(fixture.a, target, false);
    await Promise.race([entered.promise, first]);
    try {
      await expect(service.publishTarget(fixture.a, target, false)).rejects.toMatchObject({
        code: 'POST_PUBLISH_UNCONFIRMED',
      });
    } finally {
      reply.resolve();
      await first;
    }
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'published',
      error_code: null,
    });
    expect(comment).toHaveBeenCalledTimes(1);
  });

  it('leaves a target recoverable when recording the attempt fails before calling Meta', async () => {
    const driver = new FakeMetaPublishingDriver();
    const send = vi.spyOn(driver, 'publishFacebook');
    const { service, accounts, record } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    record.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.publishTarget(fixture.a, target, true)).rejects.toThrow(
      'Audit unavailable',
    );
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'scheduled',
      attempts: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('stops before any Meta request when the store is suspended', async () => {
    const driver = new FakeMetaPublishingDriver();
    const upload = vi.spyOn(driver, 'uploadFacebookPhotos');
    const { service, accounts, isActive } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    isActive.mockResolvedValue(false);
    await expect(service.publishTarget(fixture.a, target, false)).rejects.toMatchObject({
      code: 'POST_STORE_INACTIVE',
    });
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'scheduled',
      attempts: 0,
    });
    await service.publishTarget(fixture.a, target, true);
    expect(upload).not.toHaveBeenCalled();
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'failed',
      error_code: 'POST_STORE_INACTIVE',
    });
  });

  it('does not send photos to Meta if the store is suspended during media lookup', async () => {
    const driver = new FakeMetaPublishingDriver();
    const upload = vi.spyOn(driver, 'uploadFacebookPhotos');
    const { service, accounts, isActive, storage } = publishing(driver);
    storage.getObjectMetadata.mockImplementationOnce(async () => {
      isActive.mockResolvedValue(false);
      return { contentType: 'image/jpeg', sizeBytes: 42 };
    });
    const target = await setupTarget(accounts, 'facebook_page', await post());
    await service.publishTarget(fixture.a, target, true);
    expect(upload).not.toHaveBeenCalled();
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'failed',
      error_code: 'POST_STORE_INACTIVE',
    });
  });

  it('validates the stored Instagram caption before calling Meta', async () => {
    const driver = new FakeMetaPublishingDriver();
    const create = vi.spyOn(driver, 'createInstagramContainer');
    const { service, accounts } = publishing(driver);
    const target = await setupTarget(accounts, 'instagram', await post());
    await fixture.connection.pool.query(
      'update post_targets set caption_override=$1 where store_id=$2 and id=$3',
      ['ক'.repeat(2201), fixture.a, target.postTargetId],
    );
    await service.publishTarget(fixture.a, target, true);
    expect(create).not.toHaveBeenCalled();
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'failed',
      error_code: 'POST_CAPTION_TOO_LONG',
    });
  });

  it('marks a rejected token for reconnect and keeps the target retryable', async () => {
    const driver = new FakeMetaPublishingDriver();
    const send = vi
      .spyOn(driver, 'publishFacebook')
      .mockRejectedValueOnce(new MetaPublishingError('auth_error'));
    const { service, accounts, recordRejectedToken, clock } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    const [channelConnectionId] = [...accounts.keys()];
    await expect(service.publishTarget(fixture.a, target, false)).rejects.toMatchObject({
      code: 'auth_error',
    });
    expect(recordRejectedToken).toHaveBeenCalledExactlyOnceWith(
      fixture.a,
      channelConnectionId,
      expect.any(Buffer),
    );
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'scheduled',
    });
    clock.now.mockReturnValue(new Date(now.getTime() + 5 * MINUTE_MS));
    await service.publishTarget(fixture.a, target, true);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'failed',
      error_code: 'POST_TOKEN_EXPIRED',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('preserves the token rejection if recording the reconnect fails', async () => {
    const driver = new FakeMetaPublishingDriver();
    vi.spyOn(driver, 'publishFacebook').mockRejectedValueOnce(
      new MetaPublishingError('auth_error'),
    );
    const { service, accounts, recordRejectedToken } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    recordRejectedToken.mockRejectedValueOnce(new Error('Reconnect write unavailable'));
    await service.publishTarget(fixture.a, target, true);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'failed',
      error_code: 'POST_TOKEN_EXPIRED',
    });
  });

  it('marks the Instagram account for reconnect when its first comment rejects the token', async () => {
    const driver = new FakeMetaPublishingDriver();
    vi.spyOn(driver, 'comment').mockRejectedValueOnce(new MetaPublishingError('auth_error'));
    const { service, accounts, recordRejectedToken } = publishing(driver);
    const target = await setupTarget(accounts, 'instagram', await post('ইনস্টাগ্রাম'));
    const [channelConnectionId] = [...accounts.keys()];
    await service.publishTarget(fixture.a, target, true);
    expect(recordRejectedToken).toHaveBeenCalledExactlyOnceWith(
      fixture.a,
      channelConnectionId,
      expect.any(Buffer),
    );
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'published',
      error_code: 'POST_COMMENT_UNCONFIRMED',
    });
  });

  it('refuses an expired Page token at publish time without calling Meta', async () => {
    const driver = new FakeMetaPublishingDriver();
    const callMeta = vi.spyOn(driver, 'publishFacebook');
    const { service, accounts, postingCredential, storage } = publishing(
      driver,
      new Date(now.getTime() - MINUTE_MS),
    );
    const target = await setupTarget(accounts, 'facebook_page', await post());
    await service.publishTarget(fixture.b, target, true);
    expect(postingCredential).not.toHaveBeenCalled();
    await service.publishTarget(fixture.a, target, true);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'failed',
      error_code: 'POST_TOKEN_EXPIRED',
    });
    expect(callMeta).not.toHaveBeenCalled();
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();
  });
});
