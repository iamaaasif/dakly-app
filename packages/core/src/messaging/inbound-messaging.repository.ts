import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { conversations, messages } from '@dakly/db/schema/chats';

import { newId } from '../platform/database/new-id';
import { TenantDatabase } from '../platform/database/tenant-database';

type ConversationInput = Pick<
  typeof conversations.$inferInsert,
  'channel' | 'channelConnectionId' | 'contactId'
>;
type MessageInput = {
  conversationId: string;
  externalMessageId: string;
  idempotencyKey: string;
  text: string;
  sentAt: Date;
};

@Injectable()
export class InboundMessagingRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  claimMessageKey(storeId: string, idempotencyKey: string): Promise<boolean> {
    return this.database.forStore(storeId, async (tx) => {
      // A replay must wait before it can change the sender's identity.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${storeId}:${idempotencyKey}`}, 0))`,
      );
      const [message] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.storeId, storeId), eq(messages.idempotencyKey, idempotencyKey)));
      return !message;
    });
  }

  getConversation(storeId: string, input: ConversationInput, now: Date) {
    return this.database.forStore(storeId, async (tx) => {
      for (;;) {
        const [existing] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.storeId, storeId),
              eq(conversations.channelConnectionId, input.channelConnectionId),
              eq(conversations.contactId, input.contactId),
            ),
          );
        if (existing) return { ...existing, started: false };
        const [inserted] = await tx
          .insert(conversations)
          .values({ id: newId(), storeId, ...input, createdAt: now, updatedAt: now })
          .onConflictDoNothing({
            target: [conversations.channelConnectionId, conversations.contactId],
          })
          .returning({ id: conversations.id });
        if (inserted) return { ...inserted, started: true };
      }
    });
  }

  async insertMessage(storeId: string, input: MessageInput, now: Date) {
    const [message] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(messages)
        .values({
          storeId,
          conversationId: input.conversationId,
          idempotencyKey: input.idempotencyKey,
          externalId: input.externalMessageId,
          sentAt: input.sentAt,
          body: input.text,
          direction: 'in',
          authorType: 'customer',
          kind: 'text',
          status: 'received',
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: messages.id }),
    );
    return message;
  }

  async advanceConversation(
    storeId: string,
    {
      conversationId,
      at,
      expiry,
      preview,
    }: { conversationId: string; at: Date; expiry: Date; preview: string },
    now: Date,
  ) {
    const sentAt = at.toISOString();
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({
          lastInboundAt: sql`greatest(${conversations.lastInboundAt}, ${sentAt}::timestamptz)`,
          lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${sentAt}::timestamptz)`,
          windowExpiresAt: sql`greatest(${conversations.windowExpiresAt}, ${expiry.toISOString()}::timestamptz)`,
          lastMessagePreview: sql`case when ${conversations.lastMessageAt} > ${sentAt}::timestamptz then ${conversations.lastMessagePreview} else ${preview} end`,
          unreadCount: sql`${conversations.unreadCount} + 1`,
          updatedAt: now,
        })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId))),
    );
  }
}
