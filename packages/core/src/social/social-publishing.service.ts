import { Inject, Injectable, Logger } from '@nestjs/common';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import {
  MetaPublishingError,
  type MetaPost,
  type MetaPostingAccount,
  type MetaPublishingDriver,
} from '@dakly/providers/social/meta-publishing-driver';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { HOUR_MS, MINUTE_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { validateInstagramPhotos, validateInstagramPost } from './post-content';
import { publishError, socialError } from './social.errors';
import { SocialRepository } from './social.repository';

export const META_PUBLISHING_DRIVER = Symbol('META_PUBLISHING_DRIVER');

type JobTarget = Parameters<SocialRepository['findPublishTarget']>[1];
type PendingPost = NonNullable<Awaited<ReturnType<SocialRepository['findPublishTarget']>>>;
type PublishingTarget = PendingPost['target'];
type Changes = Parameters<SocialRepository['updatePublishTarget']>[2];
type AccountKind = 'facebook_page' | 'instagram';
type PostingAuthorization = {
  account: MetaPostingAccount;
  kind: AccountKind;
  verifyToken: () => Promise<void>;
};

@Injectable()
export class SocialPublishingService {
  private readonly logger = new Logger(SocialPublishingService.name);

  constructor(
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(FILE_STORAGE_DRIVER)
    private readonly storage: Pick<FileStorageDriver, 'getObjectMetadata' | 'createDownloadUrl'>,
    @Inject(META_PUBLISHING_DRIVER) private readonly driver: MetaPublishingDriver,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async checkTarget(storeId: string, input: JobTarget) {
    const match = await this.repository.findPublishTarget(storeId, input);
    if (!match || match.target.status !== 'scheduled') return;
    const { post, target } = match;
    const { channelConnectionId, scheduledFor } = target;
    let error: AppError | null = null;
    try {
      const { kind } = await this.credential(storeId, channelConnectionId, scheduledFor);
      await this.photoKeys(storeId, post.mediaFileIds, kind, scheduledFor);
    } catch (failure) {
      if (!(failure instanceof AppError)) throw failure;
      error = failure;
    }
    const errorCode = error && error.code;
    if (target.errorCode === errorCode) return;
    await this.recordTarget(storeId, target, {
      action: 'post.preflight_checked',
      errorCode,
      errorMessage: error && error.message,
    });
  }

  async publishTarget(storeId: string, input: JobTarget, finalAttempt: boolean) {
    const match = await this.repository.findPublishTarget(storeId, input);
    if (!match) return;
    const { target } = match;
    if (target.publishedAt) {
      if (target.errorCode === 'POST_COMMENT_UNCONFIRMED') this.checkDue(target);
      await this.finish(storeId, target);
      return;
    }
    this.checkDue(target);
    const attempted = await this.recordTarget(
      storeId,
      target,
      { action: 'post.publish_attempted', attempts: target.attempts + 1 },
      { requireActiveStore: true },
    ).catch(async (failure: unknown) => {
      if (!finalAttempt || !(failure instanceof AppError) || failure.code !== 'POST_STORE_INACTIVE')
        throw failure;
      await this.finish(storeId, target, failure);
      return false;
    });
    if (attempted) await this.publishApproved(storeId, match, finalAttempt);
  }

  private checkDue(target: PublishingTarget) {
    const now = this.clock.now();
    if (target.scheduledFor > now) throw socialError('POST_NOT_DUE');
    // A second delivery can see a claim before the first Meta request returns.
    if (target.attempts > 0 && now.getTime() - target.updatedAt.getTime() < MINUTE_MS)
      throw socialError('POST_PUBLISH_UNCONFIRMED');
  }

  private async publishApproved(storeId: string, match: PendingPost, finalAttempt: boolean) {
    const { target } = match;
    let published = false;
    try {
      const { authorization, request, firstComment } = await this.authorizePost(storeId, match);
      const externalId = await request(() => this.sendPost(storeId, match, authorization));
      if (externalId === undefined) return;
      published = true;

      const errorCode = firstComment ? 'POST_COMMENT_UNCONFIRMED' : null;
      // Keep Meta's receipt before writing the result event, which can roll back and be retried.
      const saved = await this.recordTarget(storeId, target, {
        action: 'post.publish_confirmed',
        externalPostId: externalId,
        publishedAt: this.clock.now(),
        errorCode,
        errorMessage: errorCode ? socialError(errorCode).message : null,
      });
      if (!saved) return;
      if (firstComment && externalId)
        await this.comment(storeId, target, authorization.verifyToken, () =>
          request(() =>
            this.meta('post_first_comment', () =>
              this.driver.comment(authorization.account, externalId, firstComment),
            ),
          ),
        );
      await this.finish(storeId, target);
    } catch (failure) {
      if (published || !finalAttempt) throw failure;
      await this.finish(storeId, target, publishError(failure, target.status));
    }
  }

  private async authorizePost(storeId: string, { post, target }: PendingPost) {
    if (post.isAiWritten && (!post.approvedAt || !post.approvedByUserId))
      throw socialError('POST_APPROVAL_REQUIRED');
    const { channelConnectionId } = target;
    const credential = await this.credential(storeId, channelConnectionId, this.clock.now());
    const account = {
      accountId: credential.externalAccountId,
      accessToken: this.encryption
        .decrypt({ owner: 'store', storeId, purpose: 'channel-access-token' }, credential)
        .toString('utf8'),
    };
    const verifyToken = async () => {
      const current = await this.credential(storeId, channelConnectionId, this.clock.now());
      if (
        current.keyVersion !== credential.keyVersion ||
        !current.ciphertext.equals(credential.ciphertext)
      )
        throw socialError('POST_TOKEN_EXPIRED');
    };
    const request = <Result>(send: () => Promise<Result>) =>
      send().catch(async (failure: unknown) => {
        if (failure instanceof MetaPublishingError && failure.code === 'auth_error')
          await this.channels
            .recordRejectedToken(storeId, channelConnectionId, credential.ciphertext)
            .catch(() => this.logger.error('Could not record the rejected Meta credential'));
        throw failure;
      });
    const { kind } = credential;
    return {
      authorization: { account, kind, verifyToken },
      request,
      firstComment: kind === 'instagram' && post.kind === 'post' ? post.firstComment : null,
    };
  }

  private async credential(storeId: string, connectionId: string, asOf: Date) {
    const credential = await this.channels.postingCredential(storeId, connectionId);
    if (!credential || (credential.expiresAt && credential.expiresAt <= asOf))
      throw socialError('POST_TOKEN_EXPIRED');
    return credential;
  }

  private async photoKeys(storeId: string, fileIds: string[], kind: AccountKind, asOf: Date) {
    if (!fileIds.length) return [];
    const rows = await this.repository.listPostMedia(storeId, fileIds, asOf);
    const keys = new Map(rows.map(({ id, objectKey }) => [id, objectKey]));
    return Promise.all(
      fileIds.map(async (fileId) => {
        const key = keys.get(fileId);
        if (!key) throw socialError('POST_MEDIA_NOT_FOUND');
        const metadata = await measureVendorCall(
          this.logger,
          'post_photo_metadata',
          'Post photo metadata request measured',
          () => this.storage.getObjectMetadata(key),
        );
        if (!metadata) throw socialError('POST_MEDIA_NOT_FOUND');
        if (kind === 'instagram') validateInstagramPhotos([metadata]);
        return key;
      }),
    );
  }

  private async sendPost(storeId: string, match: PendingPost, authorization: PostingAuthorization) {
    const { target } = match;
    const { kind, account, verifyToken } = authorization;
    const { driver } = this;
    if (target.status === 'publishing') {
      const containerId = target.containerId;
      // A timed-out publish may have succeeded. Reconcile the Instagram container without a second write to Meta.
      if (kind === 'instagram' && containerId) {
        const state = await this.meta('instagram_container_status', () =>
          driver.instagramContainerState(account, containerId),
        );
        if (state === 'published') return null;
      }
      throw socialError('POST_PUBLISH_UNCONFIRMED');
    }
    const content = await this.contentFor(storeId, match, kind);
    if (!(await this.stores.isActive(storeId))) throw socialError('POST_STORE_INACTIVE');
    if (kind === 'instagram') return this.sendInstagram(storeId, target, authorization, content);
    const photos = content.photoUrls.length
      ? await this.meta('facebook_upload_photos', () =>
          driver.uploadFacebookPhotos(account, content.photoUrls),
        )
      : [];
    return this.sendClaimed(storeId, target, verifyToken, () =>
      this.meta('facebook_publish_post', () => driver.publishFacebook(account, content, photos)),
    );
  }

  private async contentFor(
    storeId: string,
    { post, target }: PendingPost,
    kind: AccountKind,
  ): Promise<MetaPost> {
    const caption = target.captionOverride ?? post.caption ?? '';
    if (kind === 'instagram') validateInstagramPost(caption, post.mediaFileIds.length);
    if (post.kind === 'story' && post.mediaFileIds.length !== 1)
      throw socialError('POST_PHOTOS_REQUIRED');
    if (!caption.trim() && !post.linkUrl && !post.mediaFileIds.length)
      throw socialError('POST_CONTENT_REQUIRED');
    const keys = await this.photoKeys(storeId, post.mediaFileIds, kind, this.clock.now());
    return {
      kind: post.kind,
      caption,
      linkUrl: post.linkUrl,
      photoUrls: keys.map((key) => this.storage.createDownloadUrl(key, HOUR_MS / 1_000)),
    };
  }

  private async sendInstagram(
    storeId: string,
    target: PublishingTarget,
    { account, verifyToken }: PostingAuthorization,
    content: MetaPost,
  ) {
    const { driver } = this;
    let containerId = target.containerId;
    if (!containerId) {
      containerId = await this.meta('instagram_create_container', () =>
        driver.createInstagramContainer(account, content),
      );
      const change = { action: 'post.container_saved', containerId };
      if (!(await this.recordTarget(storeId, target, change))) return;
    }
    const state = await this.meta('instagram_container_status', () =>
      driver.instagramContainerState(account, containerId),
    );
    if (state === 'published') return null;
    if (state === 'failed') {
      await this.recordTarget(storeId, target, {
        action: 'post.container_cleared',
        containerId: null,
      });
      throw socialError('POST_PROVIDER_REJECTED');
    }
    if (state !== 'ready') throw socialError('POST_CONTAINER_PROCESSING');
    return this.sendClaimed(storeId, target, verifyToken, () =>
      this.meta('instagram_publish_post', () => driver.publishInstagram(account, containerId)),
    );
  }

  private async sendClaimed(
    storeId: string,
    target: PublishingTarget,
    verifyToken: () => Promise<void>,
    send: () => Promise<string>,
  ) {
    const change = { action: 'post.publishing', status: 'publishing' } as const;
    const claimed = await this.recordTarget(storeId, target, change, {
      requireActiveStore: true,
      afterUpdate: verifyToken,
    });
    if (!claimed) return;
    try {
      return await send();
    } catch (error) {
      if (error instanceof MetaPublishingError && error.code !== 'unavailable')
        await this.recordTarget(storeId, target, {
          action: 'post.publish_rejected',
          status: 'scheduled',
        });
      throw error;
    }
  }

  private async comment(
    storeId: string,
    target: PublishingTarget,
    verifyToken: () => Promise<void>,
    send: () => Promise<void>,
  ) {
    try {
      const change = { action: 'post.comment_attempted' };
      const claimed = await this.recordTarget(storeId, target, change, {
        requireActiveStore: true,
        afterUpdate: verifyToken,
      });
      if (!claimed) return;
      await send();
    } catch (failure) {
      if (failure instanceof MetaPublishingError) return;
      if (
        failure instanceof AppError &&
        (failure.code === 'POST_TOKEN_EXPIRED' || failure.code === 'POST_STORE_INACTIVE')
      )
        return;
      throw failure;
    }
    await this.recordTarget(storeId, target, {
      action: 'post.comment_published',
      errorCode: null,
      errorMessage: null,
    });
  }

  private finish(storeId: string, target: PublishingTarget, error?: AppError) {
    const common = { storeId, occurredAt: this.clock.now().toISOString() };
    const payload = { postId: target.postId, postTargetId: target.id };
    const status = error ? 'failed' : 'published';
    return this.recordTarget(
      storeId,
      target,
      {
        action: `post.${status}`,
        status,
        errorCode: error?.code ?? target.errorCode,
        errorMessage: error?.message ?? target.errorMessage,
      },
      {
        afterUpdate: async () => {
          if (!error)
            return this.outbox.publish({
              ...common,
              type: 'post.published',
              payload: { ...payload, externalPostId: target.externalPostId },
            });
          await this.outbox.publish({
            ...common,
            type: 'post.failed',
            payload: { ...payload, errorCode: error.code },
          });
          await this.notifications.notify(storeId, {
            type: 'post.failed',
            category: 'fix_now',
            recipientPermission: 'social.edit',
            title: 'A post could not be published',
            body: error.message,
            dedupeKey: `post.failed:${target.id}:${target.scheduledFor.toISOString()}`,
          });
        },
      },
    );
  }

  private async recordTarget(
    storeId: string,
    target: PublishingTarget,
    { action, ...changes }: Changes & { action: string },
    options?: { requireActiveStore?: true; afterUpdate?: () => Promise<void> },
  ) {
    const updated = await this.transaction.run(storeId, async () => {
      if (options?.requireActiveStore && !(await this.stores.isActive(storeId)))
        throw socialError('POST_STORE_INACTIVE');
      if (
        !(await this.repository.updatePublishTarget(storeId, target, {
          ...changes,
          updatedAt: this.clock.now(),
        }))
      )
        return false;
      await this.audit.record(storeId, {
        actor: { kind: 'system' },
        action,
        entityType: 'post_target',
        entityId: target.id,
      });
      await options?.afterUpdate?.();
      return true;
    });
    if (updated) Object.assign(target, changes);
    return updated;
  }

  private meta<Result>(operation: string, call: () => Promise<Result>) {
    return measureVendorCall(this.logger, operation, 'Meta publishing request measured', call);
  }
}
