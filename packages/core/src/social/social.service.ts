import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ChannelConnection } from '@dakly/contracts/channels';
import type {
  CreatePostInput,
  EditPostInput,
  PostListQuery,
  PostListResponse,
  PostResponse,
} from '@dakly/contracts/social';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { TeamService } from '../team/team.service';
import { socialError } from './social.errors';
import { SocialRepository } from './social.repository';

type UserActor = { kind: 'user'; userId: string };
type Post = NonNullable<Awaited<ReturnType<SocialRepository['findPost']>>>['post'];
type Target = Awaited<ReturnType<SocialRepository['listTargets']>>[number];

function response(post: Post, targets: Target[]): PostResponse {
  return {
    ...post,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    approvedAt: post.approvedAt?.toISOString() ?? null,
    targets: targets.map(({ postId: _postId, scheduledFor, publishedAt, ...target }) => ({
      ...target,
      scheduledFor: scheduledFor?.toISOString() ?? null,
      publishedAt: publishedAt?.toISOString() ?? null,
    })),
  };
}

@Injectable()
export class SocialService {
  constructor(
    private readonly repository: SocialRepository,
    private readonly channels: ChannelConnectionsService,
    private readonly team: TeamService,
    private readonly transaction: StoreTransaction,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  createDraft(
    storeId: string,
    input: CreatePostInput,
    key: string,
    actor: UserActor,
  ): Promise<PostResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const existing = await this.repository.findCreateKey(storeId, actor.userId, key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw socialError('POST_CREATE_KEY_USED');
        if (existing.deletedAt) throw socialError('POST_NOT_FOUND');
        const { post, targets } = await this.findPost(storeId, existing.id);
        return response(post, targets);
      }
      const now = this.clock.now();
      await this.validatePostMedia(storeId, input.mediaFileIds, now);
      await this.validateTargets(storeId, input, []);
      const { targets, ...content } = input;
      const post = await this.repository.insertPost(storeId, {
        ...content,
        createdByUserId: actor.userId,
        createKey: key,
        createFingerprint: fingerprint,
        createdAt: now,
        updatedAt: now,
      });
      if (!post) throw socialError('POST_NOT_FOUND');
      await this.repository.replaceTargets(storeId, post.id, {
        targets,
        status: this.draftStatus(post),
        now,
      });
      await this.audit.record(storeId, {
        actor,
        action: 'post.created',
        entityType: 'post',
        entityId: post.id,
      });
      return response(post, await this.repository.listTargets(storeId, [post.id]));
    });
  }

  async listPosts(
    storeId: string,
    query: PostListQuery,
    actor: UserActor,
    access: StoreAccess,
  ): Promise<PostListResponse> {
    if (query.drafts === 'team' && !this.team.canReviewSocialPosts(access, 'view'))
      throw new AppError('PERMISSION_DENIED', PLATFORM_ERRORS.PERMISSION_DENIED);
    const rows = await this.repository.listPosts(storeId, query, actor.userId);
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(({ post, targets }) => response(post, targets)),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.post.id ?? null) : null,
    };
  }

  async getPost(
    storeId: string,
    postId: string,
    actor: UserActor,
    access: StoreAccess,
  ): Promise<PostResponse> {
    const { post, targets } = await this.findPost(storeId, postId);
    if (
      post.createdByUserId !== actor.userId &&
      !targets.some(({ scheduledFor }) => scheduledFor) &&
      !this.team.canReviewSocialPosts(access, 'view')
    )
      throw socialError('POST_NOT_FOUND');
    return response(post, targets);
  }

  editDraft(
    storeId: string,
    postId: string,
    input: EditPostInput,
    actor: UserActor,
  ): Promise<PostResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const { post, targets } = await this.ownDraft(storeId, postId, actor);
      const { targets: replacement, ...change } = input;
      const { isAiWritten, kind, caption, mediaFileIds } = { ...post, ...change };
      const targetInput =
        replacement ??
        targets.map(({ channelConnectionId, captionOverride }) => ({
          channelConnectionId,
          captionOverride,
        }));
      const now = this.clock.now();
      if (change.mediaFileIds) await this.validatePostMedia(storeId, mediaFileIds, now);
      await this.validateTargets(
        storeId,
        { kind, caption, mediaFileIds, targets: targetInput },
        targets,
      );
      const edited = await this.repository.updatePost(storeId, postId, {
        ...change,
        isAiWritten: post.isAiWritten || isAiWritten,
        approvedAt: null,
        approvedByUserId: null,
        updatedAt: now,
      });
      if (!edited) throw socialError('POST_NOT_FOUND');
      if (replacement || edited.isAiWritten !== post.isAiWritten)
        await this.repository.replaceTargets(storeId, postId, {
          targets: targetInput,
          status: this.draftStatus(edited),
          now,
        });
      await this.audit.record(storeId, {
        actor,
        action: 'post.edited',
        entityType: 'post',
        entityId: postId,
      });
      return response(edited, await this.repository.listTargets(storeId, [postId]));
    });
  }

  deleteDraft(storeId: string, postId: string, actor: UserActor): Promise<void> {
    return this.transaction.runLocked(storeId, async () => {
      await this.ownDraft(storeId, postId, actor);
      const now = this.clock.now();
      await this.repository.updatePost(storeId, postId, { deletedAt: now, updatedAt: now });
      await this.audit.record(storeId, {
        actor,
        action: 'post.deleted',
        entityType: 'post',
        entityId: postId,
      });
    });
  }

  private async findPost(storeId: string, postId: string) {
    const post = await this.repository.findPost(storeId, postId);
    if (!post) throw socialError('POST_NOT_FOUND');
    return post;
  }

  private async ownDraft(storeId: string, postId: string, actor: UserActor) {
    const { post, targets } = await this.findPost(storeId, postId);
    if (post.createdByUserId !== actor.userId) throw socialError('POST_NOT_FOUND');
    if (targets.some(({ status }) => status !== 'draft' && status !== 'waiting_approval'))
      throw socialError('POST_DRAFT_REQUIRED');
    return { post, targets };
  }

  private draftStatus({ isAiWritten }: { isAiWritten: boolean }) {
    return isAiWritten ? 'waiting_approval' : 'draft';
  }

  private async validatePostMedia(storeId: string, ids: string[], now: Date) {
    if (!ids.length) return;
    const media = await this.repository.listPostMedia(storeId, ids, now);
    if (media.length !== new Set(ids).size) throw socialError('POST_MEDIA_NOT_FOUND');
  }

  private async validateTargets(
    storeId: string,
    input: Pick<CreatePostInput, 'kind' | 'caption' | 'mediaFileIds' | 'targets'>,
    previous: Target[],
  ) {
    const retained = new Set(previous.map(({ channelConnectionId }) => channelConnectionId));
    const connections = await this.targetConnections(storeId, input.targets);
    for (const target of input.targets) {
      const connection = connections.get(target.channelConnectionId);
      if (!connection || (connection.status !== 'active' && !retained.has(connection.id)))
        throw socialError('POST_CONNECTION_NOT_FOUND');
      if (input.kind === 'story' && input.mediaFileIds.length !== 1)
        throw socialError('POST_PHOTOS_REQUIRED');
      if (connection.kind === 'instagram')
        this.validateInstagram(
          target.captionOverride ?? input.caption ?? '',
          input.mediaFileIds.length,
        );
    }
  }

  private validateInstagram(caption: string, photoCount: number) {
    if (!photoCount) throw socialError('POST_PHOTOS_REQUIRED');
    if (Array.from(caption).length > 2_200) throw socialError('POST_CAPTION_TOO_LONG');
    if ((caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)?.length ?? 0) > 30)
      throw socialError('POST_TOO_MANY_HASHTAGS');
  }

  private async targetConnections(storeId: string, targets: CreatePostInput['targets']) {
    const wanted = new Set(targets.map(({ channelConnectionId }) => channelConnectionId));
    const matches = new Map<string, ChannelConnection>();
    let cursor: string | undefined;
    while (matches.size < wanted.size) {
      const page = await this.channels.list(storeId, { cursor, limit: 100 });
      for (const connection of page.items) {
        if (wanted.has(connection.id) && connection.kind !== 'whatsapp')
          matches.set(connection.id, connection);
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return matches;
  }
}
