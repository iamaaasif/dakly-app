import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import type { CommentListQuery } from '@dakly/contracts/comments';
import { channelConnections } from '@dakly/db/schema/channels';
import { socialComments } from '@dakly/db/schema/chats';
import { posts, postTargets } from '@dakly/db/schema/social';

import { newId } from '../platform/database/new-id';
import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

export type NewComment = Pick<
  typeof socialComments.$inferInsert,
  | 'channelConnectionId'
  | 'externalPostId'
  | 'externalCommentId'
  | 'parentExternalCommentId'
  | 'contactId'
  | 'authorName'
  | 'body'
  | 'commentedAt'
>;

const fields = {
  id: socialComments.id,
  kind: channelConnections.kind,
  channelConnectionId: socialComments.channelConnectionId,
  externalAccountId: channelConnections.externalAccountId,
  externalPostId: socialComments.externalPostId,
  externalCommentId: socialComments.externalCommentId,
  parentExternalCommentId: socialComments.parentExternalCommentId,
  contactId: socialComments.contactId,
  postCaption: sql<string | null>`coalesce(${postTargets.captionOverride}, ${posts.caption})`,
  authorName: socialComments.authorName,
  body: socialComments.body,
  classification: socialComments.classification,
  status: socialComments.status,
  publicReplyExternalId: socialComments.publicReplyExternalId,
  privateRepliedAt: socialComments.privateRepliedAt,
  // Keep PostgreSQL's microseconds in cursor timestamps.
  commentedAt: sql<string>`to_char(${socialComments.commentedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};

export type CommentRow = NonNullable<Awaited<ReturnType<CommentsRepository['find']>>>;

@Injectable()
export class CommentsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async insert(storeId: string, input: NewComment, now: Date): Promise<string | undefined> {
    return this.database.forStore(storeId, async (tx) => {
      const [target] = await tx
        .select({ id: postTargets.id })
        .from(postTargets)
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.channelConnectionId, input.channelConnectionId),
            eq(postTargets.externalPostId, input.externalPostId),
          ),
        );
      const [saved] = await tx
        .insert(socialComments)
        .values({
          id: newId(),
          storeId,
          ...input,
          postTargetId: target?.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [socialComments.channelConnectionId, socialComments.externalCommentId],
        })
        .returning({ id: socialComments.id });
      return saved?.id;
    });
  }

  list(storeId: string, query: CommentListQuery) {
    const filters: (SQL | undefined)[] = [
      eq(socialComments.storeId, storeId),
      query.status ? eq(socialComments.status, query.status) : undefined,
      query.classification ? eq(socialComments.classification, query.classification) : undefined,
      query.externalPostId ? eq(socialComments.externalPostId, query.externalPostId) : undefined,
    ];
    if (query.cursor) {
      const [at, id] = query.cursor.split('_') as [string, string];
      filters.push(
        or(
          lt(socialComments.commentedAt, new Date(at)),
          and(eq(socialComments.commentedAt, new Date(at)), lt(socialComments.id, id)),
        ),
      );
    }
    return this.database.forStore(storeId, (tx) =>
      this.selectRows(tx)
        .where(and(...filters))
        .orderBy(desc(socialComments.commentedAt), desc(socialComments.id))
        .limit(query.limit + 1),
    );
  }

  async find(storeId: string, id: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      this.selectRows(tx).where(
        and(eq(socialComments.storeId, storeId), eq(socialComments.id, id)),
      ),
    );
    return row;
  }

  // The claim is what keeps two staff from using the single private reply Meta allows.
  async claimPrivateReply(storeId: string, id: string, now: Date): Promise<boolean> {
    const claimed = await this.database.forStore(storeId, (tx) =>
      tx
        .update(socialComments)
        .set({ privateRepliedAt: now, updatedAt: now })
        .where(
          and(
            eq(socialComments.storeId, storeId),
            eq(socialComments.id, id),
            isNull(socialComments.privateRepliedAt),
          ),
        )
        .returning({ id: socialComments.id }),
    );
    return claimed.length > 0;
  }

  // A placeholder id holds the single public reply while Meta answers; markReplied swaps in the real one.
  async claimPublicReply(storeId: string, id: string, now: Date): Promise<boolean> {
    const claimed = await this.database.forStore(storeId, (tx) =>
      tx
        .update(socialComments)
        .set({ publicReplyExternalId: 'pending', updatedAt: now })
        .where(
          and(
            eq(socialComments.storeId, storeId),
            eq(socialComments.id, id),
            isNull(socialComments.publicReplyExternalId),
          ),
        )
        .returning({ id: socialComments.id }),
    );
    return claimed.length > 0;
  }

  async releasePublicReply(storeId: string, id: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(socialComments)
        .set({ publicReplyExternalId: null, updatedAt: now })
        .where(and(eq(socialComments.storeId, storeId), eq(socialComments.id, id))),
    );
  }

  async releasePrivateReply(storeId: string, id: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(socialComments)
        .set({ privateRepliedAt: null, updatedAt: now })
        .where(and(eq(socialComments.storeId, storeId), eq(socialComments.id, id))),
    );
  }

  async markReplied(
    storeId: string,
    id: string,
    reply: { publicReplyExternalId?: string },
    now: Date,
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(socialComments)
        .set({
          ...reply,
          // A hidden comment stays hidden after a reply.
          status: sql`case when ${socialComments.status} = 'hidden' then 'hidden' else 'replied' end`,
          updatedAt: now,
        })
        .where(and(eq(socialComments.storeId, storeId), eq(socialComments.id, id))),
    );
  }

  async setHidden(storeId: string, id: string, hidden: boolean, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(socialComments)
        .set({
          status: hidden
            ? 'hidden'
            : sql`case when ${socialComments.publicReplyExternalId} is not null or ${socialComments.privateRepliedAt} is not null then 'replied' else 'new' end`,
          updatedAt: now,
        })
        .where(and(eq(socialComments.storeId, storeId), eq(socialComments.id, id))),
    );
  }

  private selectRows(tx: Transaction) {
    return tx
      .select(fields)
      .from(socialComments)
      .innerJoin(
        channelConnections,
        and(
          eq(channelConnections.storeId, socialComments.storeId),
          eq(channelConnections.id, socialComments.channelConnectionId),
        ),
      )
      .leftJoin(
        postTargets,
        and(
          eq(postTargets.storeId, socialComments.storeId),
          eq(postTargets.id, socialComments.postTargetId),
        ),
      )
      .leftJoin(
        posts,
        and(eq(posts.storeId, postTargets.storeId), eq(posts.id, postTargets.postId)),
      );
  }
}
