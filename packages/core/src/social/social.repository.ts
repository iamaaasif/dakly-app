import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  exists,
  gte,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm';

import type {
  ConfirmPostPhotoInput,
  CreatePostInput,
  PostListQuery,
} from '@dakly/contracts/social';
import { files } from '@dakly/db/schema/platform';
import { posts, postTargets } from '@dakly/db/schema/social';

import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

type ReplacedTargets = {
  targets: CreatePostInput['targets'];
  status: 'draft' | 'waiting_approval';
  now: Date;
};

const postFields = {
  id: posts.id,
  kind: posts.kind,
  caption: posts.caption,
  mediaFileIds: posts.mediaFileIds,
  linkUrl: posts.linkUrl,
  firstComment: posts.firstComment,
  isAiWritten: posts.isAiWritten,
  createdByUserId: posts.createdByUserId,
  approvedByUserId: posts.approvedByUserId,
  approvedAt: posts.approvedAt,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
};

const targetFields = {
  id: postTargets.id,
  postId: postTargets.postId,
  channelConnectionId: postTargets.channelConnectionId,
  captionOverride: postTargets.captionOverride,
  status: postTargets.status,
  scheduledFor: postTargets.scheduledFor,
  publishedAt: postTargets.publishedAt,
  externalPostId: postTargets.externalPostId,
  errorCode: postTargets.errorCode,
  errorMessage: postTargets.errorMessage,
  reach: postTargets.reach,
  reactions: postTargets.reactions,
  comments: postTargets.comments,
  linkTaps: postTargets.linkTaps,
};

type TargetWrite = Partial<
  Pick<
    typeof postTargets.$inferInsert,
    | 'status'
    | 'attempts'
    | 'containerId'
    | 'externalPostId'
    | 'publishedAt'
    | 'errorCode'
    | 'errorMessage'
    | 'nextMetricsAt'
    | 'updatedAt'
  >
>;

type PostWrite = Omit<CreatePostInput, 'targets'> & { updatedAt: Date };

function selectPostsWithTargets(storeId: string, tx: Transaction) {
  return tx
    .select({ post: postFields, target: targetFields })
    .from(posts)
    .leftJoin(postTargets, and(eq(postTargets.storeId, storeId), eq(postTargets.postId, posts.id)));
}

type PostWithTargets = {
  post: Awaited<ReturnType<typeof selectPostsWithTargets>>[number]['post'];
  targets: NonNullable<Awaited<ReturnType<typeof selectPostsWithTargets>>[number]['target']>[];
};

function groupTargets(rows: Awaited<ReturnType<typeof selectPostsWithTargets>>): PostWithTargets[] {
  const grouped = new Map<string, PostWithTargets>();
  for (const { post, target } of rows) {
    const detail = grouped.get(post.id) ?? { post, targets: [] };
    if (target) detail.targets.push(target);
    grouped.set(post.id, detail);
  }
  return [...grouped.values()];
}

@Injectable()
export class SocialRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findPost(storeId: string, postId: string) {
    const rows = await this.database.forStore(storeId, (tx) =>
      selectPostsWithTargets(storeId, tx)
        .where(and(eq(posts.storeId, storeId), eq(posts.id, postId), isNull(posts.deletedAt)))
        .orderBy(postTargets.id),
    );
    return groupTargets(rows)[0];
  }

  async listPosts(storeId: string, query: PostListQuery, userId: string) {
    const rows = await this.database.forStore(storeId, (tx) => {
      const scheduled = tx
        .select({ id: postTargets.id })
        .from(postTargets)
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.postId, posts.id),
            isNotNull(postTargets.scheduledFor),
          ),
        );
      const creator = eq(posts.createdByUserId, userId);
      const visibility = {
        mine: and(creator, notExists(scheduled)),
        team: notExists(scheduled),
        all: or(creator, exists(scheduled)),
      };
      const visible = and(eq(posts.storeId, storeId), visibility[query.drafts ?? 'all']);
      const cursor = query.cursor
        ? tx
            .select({ createdAt: posts.createdAt, id: posts.id })
            .from(posts)
            .where(and(visible, eq(posts.id, query.cursor)))
        : undefined;
      const page = tx
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            visible,
            isNull(posts.deletedAt),
            cursor ? sql`(${posts.createdAt}, ${posts.id}) < ${cursor}` : undefined,
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(query.limit + 1);
      return selectPostsWithTargets(storeId, tx)
        .where(and(eq(posts.storeId, storeId), inArray(posts.id, page)))
        .orderBy(desc(posts.createdAt), desc(posts.id), postTargets.id);
    });
    return groupTargets(rows);
  }

  listTargets(storeId: string, postIds: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(targetFields)
        .from(postTargets)
        .where(and(eq(postTargets.storeId, storeId), inArray(postTargets.postId, postIds)))
        .orderBy(postTargets.id),
    );
  }

  listPostMedia(storeId: string, ids: string[], now: Date) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: files.id, objectKey: files.objectKey, contentType: files.contentType })
        .from(files)
        .where(
          and(
            eq(files.storeId, storeId),
            inArray(files.id, ids),
            inArray(files.purpose, ['post_media', 'product_image']),
            inArray(files.contentType, ['image/jpeg', 'image/png', 'image/webp']),
            eq(files.status, 'ready'),
            or(isNull(files.expiresAt), gt(files.expiresAt, now)),
          ),
        ),
    );
  }

  async insertPostMedia(
    storeId: string,
    input: ConfirmPostPhotoInput & { objectKey: string; uploadedByUserId: string; createdAt: Date },
  ) {
    const { fileId, ...file } = input;
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(files)
        .values({ ...file, id: fileId, storeId, purpose: 'post_media', status: 'ready' })
        .onConflictDoNothing()
        .returning({ id: files.id, objectKey: files.objectKey }),
    );
    return rows[0];
  }

  async findPublishTarget(storeId: string, input: { postTargetId: string; scheduledFor: string }) {
    const scheduledFor = new Date(input.scheduledFor);
    const [match] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          target: {
            ...targetFields,
            attempts: postTargets.attempts,
            updatedAt: postTargets.updatedAt,
            containerId: postTargets.containerId,
          },
          post: postFields,
        })
        .from(postTargets)
        .innerJoin(posts, and(eq(posts.id, postTargets.postId), eq(posts.storeId, storeId)))
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.id, input.postTargetId),
            eq(postTargets.scheduledFor, scheduledFor),
            inArray(postTargets.status, ['scheduled', 'publishing']),
            isNull(posts.deletedAt),
          ),
        ),
    );
    return match && { post: match.post, target: { ...match.target, scheduledFor } };
  }

  pendingPublishTargets(storeId: string, before: Date, after: string | undefined, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: postTargets.id, scheduledFor: postTargets.scheduledFor })
        .from(postTargets)
        .where(
          and(
            eq(postTargets.storeId, storeId),
            inArray(postTargets.status, ['scheduled', 'publishing']),
            lte(postTargets.scheduledFor, before),
            after ? gt(postTargets.id, after) : undefined,
          ),
        )
        .orderBy(postTargets.id)
        .limit(limit),
    );
  }

  async updatePublishTarget(
    storeId: string,
    current: {
      id: string;
      status: (typeof postTargets.$inferSelect)['status'];
      attempts: number;
      scheduledFor: Date;
      publishedAt: Date | null;
    },
    changes: TargetWrite,
  ) {
    const [updated] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(postTargets)
        .set(changes)
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.id, current.id),
            eq(postTargets.status, current.status),
            eq(postTargets.attempts, current.attempts),
            eq(postTargets.scheduledFor, current.scheduledFor),
            current.publishedAt
              ? eq(postTargets.publishedAt, current.publishedAt)
              : isNull(postTargets.publishedAt),
          ),
        )
        .returning({ id: postTargets.id }),
    );
    return updated;
  }

  async findByIdempotencyKey(storeId: string, userId: string, idempotencyKey: string) {
    const [match] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            eq(posts.storeId, storeId),
            eq(posts.createdByUserId, userId),
            eq(posts.idempotencyKey, idempotencyKey),
          ),
        ),
    );
    return match;
  }

  async insertPost(
    storeId: string,
    values: PostWrite & {
      createdByUserId: string;
      createdAt: Date;
      idempotencyKey: string;
    },
  ) {
    const [post] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(posts)
        .values({ ...values, storeId })
        .returning(postFields),
    );
    return post;
  }

  async updatePost(
    storeId: string,
    postId: string,
    values: Partial<PostWrite> & {
      approvedByUserId?: string | null;
      approvedAt?: Date | null;
      deletedAt?: Date;
    },
  ) {
    const [post] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(posts)
        .set(values)
        .where(and(eq(posts.storeId, storeId), eq(posts.id, postId)))
        .returning(postFields),
    );
    return post;
  }

  reservedTimes(
    storeId: string,
    connectionIds: string[],
    { from, through }: { from: Date; through?: Date },
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          channelConnectionId: postTargets.channelConnectionId,
          scheduledFor: postTargets.scheduledFor,
        })
        .from(postTargets)
        .where(
          and(
            eq(postTargets.storeId, storeId),
            inArray(postTargets.channelConnectionId, connectionIds),
            gte(postTargets.scheduledFor, from),
            through ? lte(postTargets.scheduledFor, through) : undefined,
            inArray(postTargets.status, ['scheduled', 'publishing']),
          ),
        ),
    );
  }

  moveScheduledTargets(storeId: string, ids: string[], scheduledFor: Date, now: Date) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(postTargets)
        .set({ scheduledFor, updatedAt: now })
        .where(
          and(
            eq(postTargets.storeId, storeId),
            inArray(postTargets.id, ids),
            eq(postTargets.status, 'scheduled'),
          ),
        )
        .returning({ id: postTargets.id }),
    );
  }

  scheduleTargets(
    storeId: string,
    postId: string,
    schedules: { id: string; scheduledFor: Date }[],
    now: Date,
  ) {
    const times = sql.join(
      schedules.map(
        ({ id, scheduledFor }) =>
          sql`when ${id}::uuid then ${scheduledFor.toISOString()}::timestamptz`,
      ),
      sql` `,
    );
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(postTargets)
        .set({
          status: 'scheduled',
          scheduledFor: sql`case ${postTargets.id} ${times} end`,
          updatedAt: now,
        })
        .where(and(eq(postTargets.storeId, storeId), eq(postTargets.postId, postId)))
        .returning(targetFields),
    );
  }

  async replaceTargets(storeId: string, postId: string, { targets, status, now }: ReplacedTargets) {
    await this.database.forStore(storeId, async (tx) => {
      await tx
        .delete(postTargets)
        .where(and(eq(postTargets.storeId, storeId), eq(postTargets.postId, postId)));
      if (targets.length)
        await tx.insert(postTargets).values(
          targets.map((target) => ({
            ...target,
            storeId,
            postId,
            status,
            createdAt: now,
            updatedAt: now,
          })),
        );
    });
  }
}
