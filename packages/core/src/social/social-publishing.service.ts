import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ScheduledPostTarget } from '@dakly/contracts/social';
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

type JobTarget = Omit<ScheduledPostTarget, 'storeId'>;
type PendingPost = NonNullable<Awaited<ReturnType<SocialRepository['findPublishTarget']>>>;
type PublishingTarget = PendingPost['target'];
type Changes = Parameters<SocialRepository['updatePublishTarget']>[2];
type AccountKind = 'facebook_page' | 'instagram';
type PublishReceipt = {
  externalId: string | null;
  firstComment?: { verifyToken: () => Promise<void>; send: (postId: string) => Promise<void> };
};
type MetaDelivery = PublishContext & { post: PendingPost['post']; kind: AccountKind };
type PublishContext = {
  storeId: string;
  target: PublishingTarget;
  driver: MetaPublishingDriver;
  account: MetaPostingAccount;
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
    @Inject(META_PUBLISHING_DRIVER) private readonly driver: MetaPublishingDriver | null,
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
    const driver = this.driver;
    const match = await this.repository.findPublishTarget(storeId, input);
    if (!driver || !match) return;
    const { target } = match;
    if (target.publishedAt) {
      await this.finish(storeId, target);
      return;
    }
    this.checkDue(target);
    const attempted = await this.recordTarget(storeId, target, {
      action: 'post.publish_attempted',
      attempts: target.attempts + 1,
    });
    if (!attempted) return;
    let receipt: PublishReceipt | undefined;
    try {
      receipt = await this.publishApproved(storeId, match, driver);
    } catch (failure) {
      if (!finalAttempt) throw failure;
      await this.finish(storeId, target, publishError(failure, target.status));
      return;
    }
    if (receipt) await this.completeTarget(storeId, target, receipt);
  }

  private async completeTarget(storeId: string, target: PublishingTarget, receipt: PublishReceipt) {
    const { externalId, firstComment } = receipt;
    // Record Meta's receipt before notifying consumers so a rolled-back event can be retried.
    const errorCode = firstComment ? 'POST_COMMENT_UNCONFIRMED' : null;
    const confirmed = await this.recordTarget(storeId, target, {
      action: 'post.publish_confirmed',
      externalPostId: externalId,
      publishedAt: this.clock.now(),
      errorCode,
      errorMessage: errorCode ? socialError(errorCode).message : null,
    });
    if (!confirmed || !(await this.finish(storeId, target))) return;
    if (firstComment && externalId)
      await this.comment(storeId, target, firstComment.verifyToken, () =>
        firstComment.send(externalId),
      );
  }

  private checkDue(target: PublishingTarget) {
    const now = this.clock.now();
    if (target.scheduledFor > now) throw socialError('POST_NOT_DUE');
    // A second delivery can see a claim before the first Meta request returns.
    if (target.attempts > 0 && now.getTime() - target.updatedAt.getTime() < MINUTE_MS)
      throw socialError('POST_PUBLISH_UNCONFIRMED');
  }

  private async publishApproved(
    storeId: string,
    { post, target }: PendingPost,
    driver: MetaPublishingDriver,
  ) {
    if (post.isAiWritten && [post.approvedAt, post.approvedByUserId].includes(null))
      throw socialError('POST_APPROVAL_REQUIRED');
    const { channelConnectionId } = target;
    const credential = await this.credential(storeId, channelConnectionId, this.clock.now());
    const token = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      credential,
    );
    try {
      const account = {
        accountId: credential.externalAccountId,
        accessToken: token.toString('utf8'),
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
      const context = { storeId, target, driver, account, verifyToken };
      const externalId = await request(() =>
        this.sendPost({ ...context, post, kind: credential.kind }),
      );
      if (externalId === undefined) return;
      const text = post.firstComment;
      const firstComment =
        credential.kind === 'instagram' && post.kind === 'post' && text
          ? {
              verifyToken,
              send: (id: string) =>
                request(() =>
                  this.meta('post_first_comment', () => driver.comment(account, id, text)),
                ),
            }
          : undefined;
      return { externalId, firstComment };
    } finally {
      token.fill(0);
    }
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

  private async sendPost({ post, kind, ...context }: MetaDelivery) {
    const { storeId, target, driver, account } = context;
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
    const content = await this.contentFor(storeId, { post, target }, kind);
    if (kind === 'instagram') return this.sendInstagram(context, content);
    const photos = content.photoUrls.length
      ? await this.meta('facebook_upload_photos', () =>
          driver.uploadFacebookPhotos(account, content.photoUrls),
        )
      : [];
    return this.sendClaimed(context, () =>
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

  private async sendInstagram(context: PublishContext, content: MetaPost) {
    const { storeId, target, driver, account } = context;
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
    return this.sendClaimed(context, () =>
      this.meta('instagram_publish_post', () => driver.publishInstagram(account, containerId)),
    );
  }

  private async sendClaimed(
    { storeId, target, verifyToken }: PublishContext,
    send: () => Promise<string>,
  ) {
    const change = { action: 'post.publishing', status: 'publishing' } as const;
    const claimed = await this.recordTarget(storeId, target, change, verifyToken);
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
      if (!(await this.recordTarget(storeId, target, change, verifyToken))) return;
      await send();
    } catch {
      return;
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
      async () => {
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
    );
  }

  private async recordTarget(
    storeId: string,
    target: PublishingTarget,
    { action, ...changes }: Changes & { action: string },
    afterUpdate?: () => Promise<void>,
  ) {
    const updated = await this.transaction.run(storeId, async () => {
      if (
        (changes.attempts !== undefined ||
          changes.status === 'publishing' ||
          action === 'post.comment_attempted') &&
        !(await this.stores.isActive(storeId))
      )
        return false;
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
      await afterUpdate?.();
      return true;
    });
    if (updated) Object.assign(target, changes);
    return updated;
  }

  private meta<Result>(operation: string, call: () => Promise<Result>) {
    return measureVendorCall(this.logger, operation, 'Meta publishing request measured', call);
  }
}
