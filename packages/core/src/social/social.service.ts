import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ChannelConnection } from '@dakly/contracts/channels';
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
import { nextPostingSlot } from './next-posting-slot';
import { socialError } from './social.errors';
import { SocialRepository } from './social.repository';

const recommendedSlots = Array.from({ length: 7 }, (_, weekday) =>
  ['12:30', '20:30'].map((time) => ({ weekday, time })),
).flat();

type UserActor = { kind: 'user'; userId: string };
type Editor = { actor: UserActor; access: StoreAccess };
type Post = NonNullable<Awaited<ReturnType<SocialRepository['findPost']>>>;
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
    private readonly outbox: OutboxService,
    private readonly stores: StoresService,
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
        return response(
          await this.findPost(storeId, existing.id),
          await this.repository.listTargets(storeId, [existing.id]),
        );
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
    const targets = await this.repository.listTargets(
      storeId,
      page.map(({ id }) => id),
    );
    return {
      items: page.map((post) =>
        response(
          post,
          targets.filter(({ postId }) => postId === post.id),
        ),
      ),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async getPost(
    storeId: string,
    postId: string,
    actor: UserActor,
    access: StoreAccess,
  ): Promise<PostResponse> {
    const post = await this.findPost(storeId, postId);
    const targets = await this.repository.listTargets(storeId, [postId]);
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
      const { post, targets, now } = await this.draftForScheduling(storeId, postId, editor);
      const times = await this.chooseTimes(storeId, targets, input, now);
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
    targets: Target[],
    input: SchedulePostInput,
    now: Date,
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
        recommendedSlots,
        now,
        timeZone,
        byConnection.get(channelConnectionId) ?? new Set(),
      );
      if (!scheduledFor) throw socialError('POST_NO_SLOTS');
      return { id, scheduledFor };
    });
  }

  private async draftForScheduling(storeId: string, postId: string, { actor, access }: Editor) {
    const post = await this.findPost(storeId, postId);
    if (post.createdByUserId !== actor.userId && !this.team.canReviewSocialPosts(access, 'view'))
      throw socialError('POST_NOT_FOUND');
    const targets = await this.repository.listTargets(storeId, [postId]);
    this.requireDraft(targets);
    if (!targets.length) throw socialError('POST_TARGET_REQUIRED');
    const now = this.clock.now();
    await this.validatePostMedia(storeId, post.mediaFileIds, now);
    await this.validateTargets(storeId, { ...post, targets }, []);
    return { post, targets, now };
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
    const post = await this.findPost(storeId, postId);
    if (post.createdByUserId !== actor.userId) throw socialError('POST_NOT_FOUND');
    const targets = await this.repository.listTargets(storeId, [postId]);
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
