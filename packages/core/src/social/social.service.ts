import { Inject, Injectable } from '@nestjs/common';

import type {
  CreatePostInput,
  EditPostInput,
  PostListQuery,
  PostListResponse,
  PostResponse,
  SchedulePostInput,
} from '@dakly/contracts/social';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import { nextPostingSlot, recommendedPostingSlots } from './next-posting-slot';
import { socialError } from './social.errors';
import { SocialRepository } from './social.repository';

type UserActor = { kind: 'user'; userId: string };
type Editor = { actor: UserActor; access: StoreAccess };
type Post = NonNullable<Awaited<ReturnType<SocialRepository['findPost']>>>['post'];
type Target = Awaited<ReturnType<SocialRepository['listTargets']>>[number];
type PostingConnection = Awaited<
  ReturnType<ChannelConnectionsService['postingConnections']>
>[number];

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
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  createDraft(
    storeId: string,
    input: CreatePostInput,
    idempotencyKey: string,
    actor: UserActor,
  ): Promise<PostResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const existing = await this.repository.findByIdempotencyKey(
        storeId,
        actor.userId,
        idempotencyKey,
      );
      if (existing) {
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
        idempotencyKey,
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

  approveDraft(storeId: string, postId: string, editor: Editor): Promise<PostResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const { post, targets, now } = await this.draftForScheduling(storeId, postId, editor);
      if (!this.team.canReviewSocialPosts(editor.access, 'approve'))
        throw socialError('POST_APPROVAL_REQUIRED');
      return response(await this.recordApproval(storeId, post, editor.actor, now), targets);
    });
  }

  schedulePost(
    storeId: string,
    postId: string,
    input: SchedulePostInput,
    editor: Editor,
  ): Promise<PostResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const { post, targets, now, connections } = await this.draftForScheduling(
        storeId,
        postId,
        editor,
      );
      const times = await this.chooseTimes(storeId, { targets, input, now, connections });
      const reviewed = await this.approveOnSchedule(storeId, post, editor, now);
      const scheduled = await this.repository.scheduleTargets(storeId, postId, times, now);
      await this.audit.record(storeId, {
        actor: editor.actor,
        action: 'post.scheduled',
        entityType: 'post',
        entityId: postId,
        after: { ids: scheduled.map(({ id }) => id), state: 'scheduled' },
      });
      await this.outbox.publishAll(
        times.map(({ id, scheduledFor }) => ({
          storeId,
          type: 'post.scheduled',
          occurredAt: now.toISOString(),
          payload: { postId, postTargetId: id, scheduledFor: scheduledFor.toISOString() },
        })),
      );
      return response(reviewed, scheduled);
    });
  }

  private async chooseTimes(
    storeId: string,
    {
      targets,
      input,
      now,
      connections,
    }: {
      targets: Target[];
      input: SchedulePostInput;
      now: Date;
      connections: Map<string, PostingConnection>;
    },
  ) {
    const ids = targets.map(({ channelConnectionId }) => channelConnectionId);
    if ('scheduledFor' in input) {
      const scheduledFor = new Date(input.scheduledFor);
      if (scheduledFor <= now) throw socialError('POST_TIME_IN_PAST');
      const reserved = await this.repository.reservedTimes(storeId, ids, {
        from: scheduledFor,
        through: scheduledFor,
      });
      if (reserved.length) throw socialError('POST_SLOT_TAKEN');
      return targets.map(({ id }) => ({ id, scheduledFor }));
    }

    const timeZone = await this.stores.timeZone(storeId);
    const reserved = await this.repository.reservedTimes(storeId, ids, { from: now });
    const byConnection = new Map<string, Set<number>>();
    for (const { channelConnectionId, scheduledFor } of reserved) {
      if (!scheduledFor) continue;
      const times = byConnection.get(channelConnectionId) ?? new Set<number>();
      times.add(scheduledFor.getTime());
      byConnection.set(channelConnectionId, times);
    }
    return targets.map(({ id, channelConnectionId }) => {
      const scheduledFor = nextPostingSlot(
        connections.get(channelConnectionId)?.postingSlots ?? recommendedPostingSlots,
        now,
        timeZone,
        byConnection.get(channelConnectionId) ?? new Set(),
      );
      if (!scheduledFor) throw socialError('POST_NO_SLOTS');
      return { id, scheduledFor };
    });
  }

  private async draftForScheduling(storeId: string, postId: string, { actor, access }: Editor) {
    const { post, targets } = await this.findPost(storeId, postId);
    if (post.createdByUserId !== actor.userId && !this.team.canReviewSocialPosts(access, 'view'))
      throw socialError('POST_NOT_FOUND');
    this.requireDraft(targets);
    if (!targets.length) throw socialError('POST_TARGET_REQUIRED');
    const now = this.clock.now();
    await this.validatePostMedia(storeId, post.mediaFileIds, now);
    const connections = await this.validateTargets(storeId, { ...post, targets }, []);
    if (
      !post.mediaFileIds.length &&
      !post.linkUrl &&
      targets.some(({ captionOverride }) => !(captionOverride ?? post.caption)?.trim())
    )
      throw socialError('POST_CONTENT_REQUIRED');
    return { post, targets, now, connections };
  }

  private approveOnSchedule(storeId: string, post: Post, { actor, access }: Editor, now: Date) {
    if (!post.isAiWritten || post.approvedAt) return post;
    if (!this.team.canReviewSocialPosts(access, 'approve'))
      throw socialError('POST_APPROVAL_REQUIRED');
    return this.recordApproval(storeId, post, actor, now);
  }

  private async recordApproval(storeId: string, post: Post, actor: UserActor, now: Date) {
    if (post.approvedAt) return post;
    const approved = await this.repository.updatePost(storeId, post.id, {
      approvedByUserId: actor.userId,
      approvedAt: now,
      updatedAt: now,
    });
    if (!approved) throw socialError('POST_NOT_FOUND');
    await this.audit.record(storeId, {
      actor,
      action: 'post.approved',
      entityType: 'post',
      entityId: post.id,
    });
    return approved;
  }

  private async findPost(storeId: string, postId: string) {
    const post = await this.repository.findPost(storeId, postId);
    if (!post) throw socialError('POST_NOT_FOUND');
    return post;
  }

  private async ownDraft(storeId: string, postId: string, actor: UserActor) {
    const { post, targets } = await this.findPost(storeId, postId);
    if (post.createdByUserId !== actor.userId) throw socialError('POST_NOT_FOUND');
    this.requireDraft(targets);
    return { post, targets };
  }

  private requireDraft(targets: Target[]) {
    if (targets.some(({ status }) => status !== 'draft' && status !== 'waiting_approval'))
      throw socialError('POST_DRAFT_REQUIRED');
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
    if (input.kind === 'story' && input.mediaFileIds.length !== 1)
      throw socialError('POST_PHOTOS_REQUIRED');
    const retained = new Set(previous.map(({ channelConnectionId }) => channelConnectionId));
    const ids = input.targets.map(({ channelConnectionId }) => channelConnectionId);
    const selected = await this.channels.postingConnections(storeId, ids);
    const connections = new Map(selected.map((connection) => [connection.id, connection]));
    for (const target of input.targets) {
      const connection = connections.get(target.channelConnectionId);
      if (!connection || (connection.status !== 'active' && !retained.has(connection.id)))
        throw socialError('POST_CONNECTION_NOT_FOUND');
      if (connection.kind === 'instagram')
        this.validateInstagram(
          target.captionOverride ?? input.caption ?? '',
          input.mediaFileIds.length,
        );
    }
    return connections;
  }

  private validateInstagram(caption: string, photoCount: number) {
    if (!photoCount) throw socialError('POST_PHOTOS_REQUIRED');
    if (Array.from(caption).length > 2_200) throw socialError('POST_CAPTION_TOO_LONG');
    if ((caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)?.length ?? 0) > 30)
      throw socialError('POST_TOO_MANY_HASHTAGS');
  }
}
