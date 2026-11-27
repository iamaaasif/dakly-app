import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';

import type {
  ChatIntent,
  ConversationCountsResponse,
  ConversationListQuery,
  ConversationMessageListQuery,
  UpdateConversationInput,
  conversationResponders,
  handoverReasons,
} from '@dakly/contracts/chats';
import type { Database } from '@dakly/db/client';
import { conversations, messages } from '@dakly/db/schema/chats';
import { contacts } from '@dakly/db/schema/contacts';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { conversationFields as fields } from './conversation-fields.repository';
import { folderCondition, folderCounts, statusOfState } from './conversation-folders.repository';

// A ranked cursor reads rank_time_id; the plain one reads time_id. A chat with no message has "none".
function afterCursor(query: ConversationListQuery, group: SQL, activityAt: SQL) {
  if (!query.cursor) return undefined;
  const parts = query.cursor.split('_');
  const rank = parts.length === 3 ? Number(parts.shift()) : 0;
  const [at, id] = parts;
  const waitingLongest = query.sort === 'waiting';
  const noMessage = waitingLongest ? 'infinity' : '-infinity';
  const cursorAt = at === 'none' ? noMessage : at;
  const afterInGroup = waitingLongest
    ? sql`(${activityAt}, ${conversations.id}) > (${cursorAt}::timestamptz, ${id}::uuid)`
    : sql`(${activityAt}, ${conversations.id}) < (${cursorAt}::timestamptz, ${id}::uuid)`;
  return or(sql`${group} > ${rank}`, and(sql`${group} = ${rank}`, afterInGroup));
}

function groupRank(sort: ConversationListQuery['sort']) {
  if (sort === 'needs_you')
    return sql`(case when ${conversations.status} = 'needs_you' then 0 else 1 end)`;
  if (sort === 'unread' || sort === 'waiting')
    return sql`(case when ${conversations.unreadCount} > 0 then 0 else 1 end)`;
  return sql`(0)::int`;
}

const messageFields = {
  id: messages.id,
  direction: messages.direction,
  authorType: messages.authorType,
  authorUserId: messages.authorUserId,
  kind: messages.kind,
  body: messages.body,
  status: messages.status,
  sourceType: messages.sourceType,
  createdAt: sql<string>`to_char(${messages.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  sentAt: messages.sentAt,
};

type ConversationChange = UpdateConversationInput & {
  responder?: (typeof conversationResponders)[number];
  aiResumesAt?: Date | null;
  handoverReason?: (typeof handoverReasons)[number] | null;
  handoverSummary?: string | null;
  handedOverAt?: Date | null;
  intentTag?: ChatIntent;
};

@Injectable()
export class InboxRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly globalDatabase: Database,
  ) {}

  async dueReturns(asOf: Date) {
    const result = await this.globalDatabase.execute<{ storeId: string; conversationId: string }>(
      sql`select store_id as "storeId", conversation_id as "conversationId" from due_conversation_returns(${asOf}, 100)`,
    );
    return result.rows;
  }

  list(storeId: string, userId: string, query: ConversationListQuery, contactIds?: string[]) {
    const waitingLongest = query.sort === 'waiting';
    // Chats with no message sort last in both directions.
    const activityAt = sql`coalesce(${conversations.lastMessageAt}, ${waitingLongest ? sql`'infinity'` : sql`'-infinity'`}::timestamptz)`;
    const group = groupRank(query.sort);
    const beforeCursor = afterCursor(query, group, activityAt);
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ ...fields, sortGroup: sql<number>`${group}::int` })
        .from(conversations)
        .innerJoin(
          contacts,
          and(
            eq(contacts.storeId, conversations.storeId),
            eq(contacts.id, conversations.contactId),
          ),
        )
        .where(
          and(
            eq(conversations.storeId, storeId),
            isNull(contacts.deletedAt),
            beforeCursor,
            query.folder ? folderCondition(query.folder, userId) : undefined,
            query.state ? statusOfState[query.state] : undefined,
            query.channel ? eq(conversations.channel, query.channel) : undefined,
            query.label ? sql`${query.label} = any(${contacts.tags})` : undefined,
            query.assigneeUserId
              ? eq(conversations.assigneeUserId, query.assigneeUserId)
              : undefined,
            contactIds ? inArray(conversations.contactId, contactIds) : undefined,
          ),
        )
        .orderBy(
          asc(group),
          waitingLongest ? asc(activityAt) : desc(activityAt),
          waitingLongest ? asc(conversations.id) : desc(conversations.id),
        )
        .limit(query.limit + 1),
    );
  }

  async counts(storeId: string, userId: string): Promise<ConversationCountsResponse> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(folderCounts(userId))
        .from(conversations)
        .innerJoin(
          contacts,
          and(
            eq(contacts.storeId, conversations.storeId),
            eq(contacts.id, conversations.contactId),
          ),
        )
        .where(and(eq(conversations.storeId, storeId), isNull(contacts.deletedAt))),
    );
    return row!;
  }

  async find(storeId: string, id: string, lock?: 'no key update') {
    const [row] = await this.database.forStore(storeId, (tx) => {
      const query = tx
        .select(fields)
        .from(conversations)
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, id)));
      return lock ? query.for(lock) : query;
    });
    return row;
  }

  async referralOf(storeId: string, id: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          adId: conversations.referralAdId,
          postId: conversations.referralPostId,
          title: conversations.referralTitle,
          photoUrl: conversations.referralPhotoUrl,
          channelConnectionId: conversations.channelConnectionId,
          channel: conversations.channel,
          referredAt: conversations.referredAt,
        })
        .from(conversations)
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, id))),
    );
    return row;
  }

  async replyRoute(storeId: string, id: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          contactId: conversations.contactId,
          channel: conversations.channel,
          connectionId: conversations.channelConnectionId,
          windowExpiresAt: conversations.windowExpiresAt,
        })
        .from(conversations)
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, id))),
    );
    return row;
  }

  // Opening a chat reads it; no new version, so a take-over in progress is not disturbed.
  async markRead(storeId: string, id: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({ unreadCount: 0 })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, id)))
        .returning(fields),
    );
    return row;
  }

  // The AI's own chats, or the chats it just handed to people, for the draft it leaves them.
  aiReplyTurn(
    storeId: string,
    id: string,
    lock: boolean,
    responder: 'ai' | 'human' | 'any' = 'ai',
  ) {
    return this.database.forStore(storeId, async (tx) => {
      const query = tx
        .select({
          contactId: conversations.contactId,
          channel: conversations.channel,
          connectionId: conversations.channelConnectionId,
          version: conversations.version,
          windowExpiresAt: conversations.windowExpiresAt,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.storeId, storeId),
            eq(conversations.id, id),
            responder === 'any' ? undefined : eq(conversations.responder, responder),
          ),
        );
      const [conversation] = await (lock ? query.for('no key update') : query);
      if (!conversation) return undefined;
      const inbound = await tx
        .select({
          id: messages.id,
          senderIdentityId: messages.senderIdentityId,
          body: messages.body,
          mediaText: messages.mediaText,
          attachments: messages.attachments,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.conversationId, id),
            eq(messages.direction, 'in'),
            ne(messages.kind, 'note'),
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(20);
      const latest = inbound[0];
      if (latest?.senderIdentityId == null) return undefined;
      return {
        ...conversation,
        latest: { ...latest, senderIdentityId: latest.senderIdentityId },
        inbound,
      };
    });
  }

  async findStaffReply(storeId: string, messageId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ conversationId: messages.conversationId, createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.id, messageId),
            eq(messages.direction, 'out'),
            eq(messages.authorType, 'user'),
          ),
        ),
    );
    return row;
  }

  async aiRepliesSince(storeId: string, since: Date) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ replies: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.direction, 'out'),
            eq(messages.authorType, 'ai'),
            inArray(messages.status, ['sent', 'delivered', 'read']),
            gte(messages.createdAt, since),
          ),
        ),
    );
    return row?.replies ?? 0;
  }

  async firstAiReplySince(storeId: string, contactId: string, since: Date) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .innerJoin(
          conversations,
          and(
            eq(conversations.storeId, messages.storeId),
            eq(conversations.id, messages.conversationId),
          ),
        )
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(conversations.contactId, contactId),
            eq(messages.authorType, 'ai'),
            gte(messages.createdAt, since),
          ),
        )
        .orderBy(asc(messages.createdAt))
        .limit(1),
    );
    return row?.createdAt;
  }

  messages(storeId: string, conversationId: string, query: ConversationMessageListQuery) {
    const [cursorAt, cursorId] = query.cursor?.split('_') ?? [];
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(messageFields)
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.conversationId, conversationId),
            query.cursor
              ? sql`(${messages.createdAt}, ${messages.id}) < (${cursorAt}::timestamptz, ${cursorId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(query.limit + 1),
    );
  }

  replyHistory(storeId: string, conversationId: string, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: messages.id,
          direction: messages.direction,
          body: messages.body,
          mediaText: messages.mediaText,
          aiSources: messages.aiSources,
        })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.conversationId, conversationId),
            ne(messages.kind, 'note'),
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit),
    );
  }

  async addNote(
    storeId: string,
    conversationId: string,
    note: { body: string; authorUserId: string },
    now: Date,
  ) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(messages)
        .values({
          ...note,
          storeId,
          conversationId,
          direction: 'out',
          authorType: 'user',
          kind: 'note',
          status: 'received',
          createdAt: now,
        })
        .returning(messageFields),
    );
    return row!;
  }

  // Saved only while people hold the chat and nobody, the customer included, wrote after the burst
  // the draft answers.
  async saveSuggestedReply(storeId: string, id: string, text: string, burstAt: Date) {
    const answered = sql`exists (select 1 from ${messages} where ${messages.storeId} = ${storeId}
      and ${messages.conversationId} = ${id} and ${messages.createdAt} > ${burstAt.toISOString()}::timestamptz
      and (${messages.direction} = 'in' or ${messages.authorType} in ('user', 'ai')))`;
    const saved = await this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({ suggestedReply: text })
        .where(
          and(
            eq(conversations.storeId, storeId),
            eq(conversations.id, id),
            eq(conversations.status, 'needs_you'),
            eq(conversations.responder, 'human'),
            sql`not ${answered}`,
          ),
        )
        .returning({ id: conversations.id }),
    );
    return saved.length > 0;
  }

  async update(
    storeId: string,
    id: string,
    change: ConversationChange,
    { now, bumpVersion = true }: { now: Date; bumpVersion?: boolean },
  ) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({
          ...change,
          updatedAt: now,
          // A responder-only system change must not cancel an inbound reopen.
          version: bumpVersion ? sql`${conversations.version} + 1` : undefined,
        })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, id)))
        .returning(fields),
    );
    return row;
  }
}
