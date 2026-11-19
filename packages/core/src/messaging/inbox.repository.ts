import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import type {
  ConversationListQuery,
  ConversationMessageListQuery,
  UpdateConversationInput,
  conversationResponders,
} from '@dakly/contracts/chats';
import { conversations, messages } from '@dakly/db/schema/chats';

import { TenantDatabase } from '../platform/database/tenant-database';

const fields = {
  id: conversations.id,
  channel: conversations.channel,
  contactId: conversations.contactId,
  status: conversations.status,
  responder: conversations.responder,
  assigneeUserId: conversations.assigneeUserId,
  handoverReason: conversations.handoverReason,
  handedOverAt: conversations.handedOverAt,
  aiResumesAt: conversations.aiResumesAt,
  // Keep PostgreSQL's microseconds in cursor timestamps.
  lastMessageAt: sql<
    string | null
  >`to_char(${conversations.lastMessageAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  lastMessagePreview: conversations.lastMessagePreview,
  windowExpiresAt: conversations.windowExpiresAt,
  unreadCount: conversations.unreadCount,
};

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
  handoverReason?: null;
  handedOverAt?: null;
};

@Injectable()
export class InboxRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, query: ConversationListQuery) {
    const [cursorAt, cursorId] = query.cursor?.split('_') ?? [];
    let beforeCursor: SQL | undefined;
    if (cursorId)
      beforeCursor =
        cursorAt === 'none'
          ? and(isNull(conversations.lastMessageAt), lt(conversations.id, cursorId))
          : or(
              isNull(conversations.lastMessageAt),
              sql`(${conversations.lastMessageAt}, ${conversations.id}) < (${cursorAt}::timestamptz, ${cursorId}::uuid)`,
            );
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(fields)
        .from(conversations)
        .where(
          and(
            eq(conversations.storeId, storeId),
            beforeCursor,
            query.status ? eq(conversations.status, query.status) : undefined,
            query.responder ? eq(conversations.responder, query.responder) : undefined,
            query.channel ? eq(conversations.channel, query.channel) : undefined,
            query.assigneeUserId
              ? eq(conversations.assigneeUserId, query.assigneeUserId)
              : undefined,
          ),
        )
        .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.id))
        .limit(query.limit + 1),
    );
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

  async update(storeId: string, id: string, change: ConversationChange, now: Date) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({ ...change, updatedAt: now, version: sql`${conversations.version} + 1` })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, id)))
        .returning(fields),
    );
    return row;
  }
}
