import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';

import type {
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
  handoverReason?: (typeof handoverReasons)[number] | null;
  handedOverAt?: Date | null;
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

  aiReplyTurn(storeId: string, id: string, lock: boolean) {
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
            eq(conversations.responder, 'ai'),
          ),
        );
      const [conversation] = await (lock ? query.for('no key update') : query);
      if (!conversation) return undefined;
      const inbound = await tx
        .select({
          id: messages.id,
          senderIdentityId: messages.senderIdentityId,
          body: messages.body,
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
