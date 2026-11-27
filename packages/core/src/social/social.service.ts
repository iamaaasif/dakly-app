import { randomUUID } from 'node:crypto';

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
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import { nextPostingSlot, recommendedPostingSlots } from './next-posting-slot';
import { validateInstagramPhotos, validateInstagramPost } from './post-content';
import { copyOf, photosOf, response } from './post-response';
import { socialError } from './social.errors';
import { SocialRepository } from './social.repository';

type UserActor = { kind: 'user'; userId: string };
type Editor = { actor: UserActor; access: StoreAccess };
type Post = NonNullable<Awaited<ReturnType<SocialRepository['findPost']>>>['post'];
type Target = Awaited<ReturnType<SocialRepository['listTargets']>>[number];
type PostingConnection = Awaited<
  ReturnType<ChannelConnectionsService['postingConnections']>
>[number];

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
    @Inject(FILE_STORAGE_DRIVER)
    private readonly storage: Pick<FileStorageDriver, 'createDownloadUrl'>,
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
        return this.respond(storeId, post, targets);
      }
      const now = this.clock.now();
      const connections = await this.validateTargets(storeId, input, []);
      await this.validatePostMedia(
        storeId,
        input.mediaFileIds,
        now,
        this.hasInstagram(connections),
      );
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
      return this.respond(storeId, post, await this.repository.listTargets(storeId, [post.id]));
    });
  }

  private async respond(storeId: string, post: Post, targets: Target[]) {
    return response(post, targets, photosOf(post, await this.photoUrls(storeId, [post])));
  }

  private async respondAll(storeId: string, rows: { post: Post; targets: Target[] }[]) {
    const urls = await this.photoUrls(
      storeId,
      rows.map(({ post }) => post),
    );
    return rows.map(({ post, targets }) => response(post, targets, photosOf(post, urls)));
  }

  private async photoUrls(storeId: string, posts: Post[]) {
    const ids = [...new Set(posts.flatMap(({ mediaFileIds }) => mediaFileIds))];
    const files = ids.length
      ? await this.repository.listPostMedia(storeId, ids, this.clock.now())
      : [];
    return new Map(
      files.map(({ id, objectKey }) => [id, this.storage.createDownloadUrl(objectKey, 15 * 60)]),
    );
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
      items: await this.respondAll(storeId, page),
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
    return this.respond(storeId, post, targets);
  }

  // A copy is always a new private draft of the caller, even when the source is scheduled or published.
  async duplicatePost(
    storeId: string,
    postId: string,
    actor: UserActor,
    access: StoreAccess,
  ): Promise<PostResponse> {
    const source = await this.getPost(storeId, postId, actor, access);
    return this.createDraft(storeId, copyOf(source), randomUUID(), actor);
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
      const connections = await this.validateTargets(
        storeId,
        { kind, caption, mediaFileIds, targets: targetInput },
        targets,
      );
      const instagram = this.hasInstagram(connections);
      if (change.mediaFileIds || instagram)
        await this.validatePostMedia(storeId, mediaFileIds, now, instagram);
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
      return this.respond(storeId, edited, await this.repository.listTargets(storeId, [postId]));
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
      return this.respond(
        storeId,
        await this.recordApproval(storeId, post, editor.actor, now),
        targets,
      );
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
      return this.respond(storeId, reviewed, scheduled);
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
    // A reservation before now can occupy the second occurrence of a repeated local time.
    const reserved = await this.repository.reservedTimes(storeId, ids, {
      from: new Date(now.getTime() - DAY_MS),
    });
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
    const connections = await this.validateTargets(storeId, { ...post, targets }, []);
    await this.validatePostMedia(storeId, post.mediaFileIds, now, this.hasInstagram(connections));
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

  private hasInstagram(connections: ReadonlyMap<string, PostingConnection>) {
    return [...connections.values()].some(({ kind }) => kind === 'instagram');
  }

  private async validatePostMedia(storeId: string, ids: string[], now: Date, instagram: boolean) {
    if (!ids.length) return;
    const media = await this.repository.listPostMedia(storeId, ids, now);
    if (media.length !== new Set(ids).size) throw socialError('POST_MEDIA_NOT_FOUND');
    if (instagram) validateInstagramPhotos(media);
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
        validateInstagramPost(
          target.captionOverride ?? input.caption ?? '',
          input.mediaFileIds.length,
        );
    }
    return connections;
  }
}
