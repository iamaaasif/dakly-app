import { randomUUID } from 'node:crypto';

import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ScheduledPostTarget } from '@dakly/contracts/social';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import { FakeMetaPublishingDriver } from '@dakly/providers/social/meta/fake-meta-publishing-driver';
import { MetaPublishingError } from '@dakly/providers/social/meta-publishing-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { AuditService } from '../audit/audit.service';
import type { ChannelConnectionsService } from '../channels/channel-connections.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { loadEnv } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import type { StoresService } from '../stores/stores.service';
import { SocialPublishingQueueService } from './social-publishing-queue.service';
import { SocialPublishingService } from './social-publishing.service';
import { SocialRepository } from './social.repository';

describe('SocialPublishingService', () => {
  const fixture = new OwnerIsolationFixture();
  const now = new Date('2026-11-20T06:00:00Z');
  const encryption = new EnvelopeEncryption(loadEnv().encryption);
  const queue = new Queue<ScheduledPostTarget>(QUEUES.outbound, {
    connection: toRedisConnection(process.env.REDIS_URL!),
    prefix: `social-tests-${randomUUID()}`,
  });

  beforeAll(() => fixture.setup());
  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await fixture.close();
  });

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
    const repository = new SocialRepository(fixture.tenant);
    const storage = {
      getObjectMetadata: vi.fn<FileStorageDriver['getObjectMetadata']>(async () => ({
        contentType: 'image/jpeg',
        sizeBytes: 42,
      })),
      createDownloadUrl: vi.fn(() => 'https://storage.test/photo.jpg'),
    };
    const notify = vi.fn();
    const isActive = vi.fn(async () => true);
    const stores = {
      isActive,
      maintenanceStoreIds: vi.fn(async () => [fixture.a, fixture.b]),
    } as unknown as StoresService;
    const publish = vi.fn();
    const service = new SocialPublishingService(
      repository,
      { postingCredential } as unknown as ChannelConnectionsService,
      storage,
      driver,
      encryption,
      new StoreTransaction(fixture.tenant),
      { record: vi.fn() } as unknown as AuditService,
      { publish } as unknown as OutboxService,
      { notify } as unknown as NotificationsService,
      clock,
      stores,
    );
    const scheduling = new SocialPublishingQueueService(
      repository,
      driver,
      clock,
      {
        maintenanceStoreIds: vi.fn(async () => [fixture.a, fixture.b]),
      } as unknown as StoresService,
      queue,
    );
    return {
      service,
      scheduling,
      accounts,
      publish,
      notify,
      storage,
      postingCredential,
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

  async function post() {
    const postId = randomUUID();
    const fileId = randomUUID();
    await fixture.connection.pool.query(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status) values($1::uuid,$2,'post_media',$1::text,'image/jpeg',42,'ready')",
      [fileId, fixture.a],
    );
    await fixture.connection.pool.query(
      "insert into posts(id,store_id,caption,media_file_ids,created_by_user_id) values($1,$2,'Common caption',$3,$4)",
      [postId, fixture.a, [fileId], fixture.userA],
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
    const { service, accounts, publish, notify, clock } = publishing(driver);
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
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      fixture.a,
      expect.objectContaining({ category: 'fix_now', recipientPermission: 'social.edit' }),
    );
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
    const { service, accounts, publish, notify } = publishing(driver);
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
    expect(notify).not.toHaveBeenCalled();
  });

  it('sends the first comment only to Instagram when the post goes to both accounts', async () => {
    const driver = new FakeMetaPublishingDriver();
    const comment = vi.spyOn(driver, 'comment');
    const { service, accounts } = publishing(driver);
    const postId = await post();
    await fixture.connection.pool.query(
      'update posts set first_comment=$1 where store_id=$2 and id=$3',
      ['ইনস্টাগ্রাম', fixture.a, postId],
    );
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

  it('stops before any Meta request when the store is suspended', async () => {
    const driver = new FakeMetaPublishingDriver();
    const upload = vi.spyOn(driver, 'uploadFacebookPhotos');
    const { service, accounts, isActive } = publishing(driver);
    const target = await setupTarget(accounts, 'facebook_page', await post());
    isActive.mockResolvedValue(false);
    await service.publishTarget(fixture.a, target, true);
    expect(upload).not.toHaveBeenCalled();
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'scheduled',
      attempts: 0,
    });
  });

  it('recovers one delayed publish job and one day-ahead check for an already scheduled target', async () => {
    const { scheduling, accounts } = publishing();
    const date = new Date(now.getTime() + 2 * DAY_MS);
    const target = await setupTarget(accounts, 'facebook_page', await post(), date);
    const id = `${target.postTargetId}-${date.getTime()}`;
    await scheduling.onApplicationBootstrap();
    await scheduling.enqueueTarget(fixture.a, target);
    const check = await queue.getJob(`check-${id}`);
    const publish = await queue.getJob(`publish-${id}`);
    const jobIds = (await queue.getDelayed()).filter(({ id: jobId }) => jobId?.endsWith(id));
    expect(jobIds.map(({ name }) => name).sort()).toEqual([
      'check-post-target',
      'publish-post-target',
    ]);
    expect(check).toMatchObject({
      data: { storeId: fixture.a, ...target },
      opts: { delay: DAY_MS },
    });
    expect(publish).toMatchObject({
      data: { storeId: fixture.a, ...target },
      opts: { delay: 2 * DAY_MS, attempts: 4 },
    });
  });

  it('requeues a failed publishing job when the target still needs work', async () => {
    const { scheduling, accounts } = publishing();
    const target = await setupTarget(accounts, 'facebook_page', await post());
    const id = `publish-${target.postTargetId}-${now.getTime()}`;
    await queue.add(
      'publish-post-target',
      { storeId: fixture.a, ...target },
      { jobId: id, attempts: 1 },
    );
    const worker = new Worker(
      QUEUES.outbound,
      async () => {
        throw new Error('Write unavailable');
      },
      {
        connection: toRedisConnection(process.env.REDIS_URL!),
        prefix: queue.opts.prefix,
      },
    );
    try {
      await expect.poll(() => queue.getJobState(id)).toBe('failed');
    } finally {
      await worker.close();
    }
    await scheduling.onApplicationBootstrap();
    expect(await queue.getJobState(id)).toBe('waiting');
    expect((await queue.getJob(id))?.attemptsMade).toBe(0);
  });

  it('flags a missing storage object before publishing', async () => {
    const { service, accounts, storage } = publishing();
    const target = await setupTarget(
      accounts,
      'instagram',
      await post(),
      new Date(now.getTime() + DAY_MS / 2),
    );
    storage.getObjectMetadata.mockResolvedValue(null);
    await service.checkTarget(fixture.a, target);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'scheduled',
      error_code: 'POST_MEDIA_NOT_FOUND',
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

  it('flags an expired Page token for its store without calling Meta', async () => {
    const driver = new FakeMetaPublishingDriver();
    const callMeta = vi.spyOn(driver, 'publishFacebook');
    const { service, accounts, postingCredential, storage } = publishing(
      driver,
      new Date(now.getTime() - MINUTE_MS),
    );
    const target = await setupTarget(
      accounts,
      'facebook_page',
      await post(),
      new Date(now.getTime() + DAY_MS),
    );
    await service.checkTarget(fixture.b, target);
    expect(postingCredential).not.toHaveBeenCalled();
    await service.checkTarget(fixture.a, target);
    expect(await fixture.row('post_targets', target.postTargetId)).toMatchObject({
      status: 'scheduled',
      error_code: 'POST_TOKEN_EXPIRED',
    });
    expect(callMeta).not.toHaveBeenCalled();
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();
  });
});
