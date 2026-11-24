import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { MessageAttachment, messageAttachmentKinds } from '@dakly/contracts/chats';
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
  senderIdentityId: string;
  text: string | null;
  attachments: { kind: (typeof messageAttachmentKinds)[number]; sourceUrl: string }[];
  sentAt: Date;
};

// A late delivery of an older message cannot replace a newer referral.
function newerReferral(
  referral: { adId: string | null; postId: string | null; title: string | null },
  sentAt: string,
) {
  const isNewer = sql`(${conversations.referredAt} is null or ${conversations.referredAt} < ${sentAt}::timestamptz)`;
  return {
    referralAdId: sql`case when ${isNewer} then ${referral.adId} else ${conversations.referralAdId} end`,
    referralPostId: sql`case when ${isNewer} then ${referral.postId} else ${conversations.referralPostId} end`,
    referralTitle: sql`case when ${isNewer} then ${referral.title} else ${conversations.referralTitle} end`,
    referredAt: sql`case when ${isNewer} then ${sentAt}::timestamptz else ${conversations.referredAt} end`,
  };
}

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
      const fields = {
        id: conversations.id,
        status: conversations.status,
        lastInboundAt: conversations.lastInboundAt,
        version: conversations.version,
      };
      for (;;) {
        const [existing] = await tx
          .select(fields)
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
          .returning(fields);
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
          senderIdentityId: input.senderIdentityId,
          externalId: input.externalMessageId,
          sentAt: input.sentAt,
          body: input.text,
          direction: 'in',
          authorType: 'customer',
          kind: input.text ? 'text' : (input.attachments[0]?.kind ?? 'text'),
          attachments: input.attachments.length
            ? input.attachments.map((item): MessageAttachment => ({ ...item, status: 'pending' }))
            : null,
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
      reopenVersion,
      referral,
    }: {
      conversationId: string;
      at: Date;
      expiry: Date;
      preview: string;
      reopenVersion?: number;
      referral?: { adId: string | null; postId: string | null; title: string | null };
    },
    now: Date,
  ) {
    const sentAt = at.toISOString();
    const canReopen =
      reopenVersion === undefined ? undefined : sql`${conversations.version} = ${reopenVersion}`;
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({
          ...(canReopen && {
            status: sql`case when ${canReopen} then 'open' else ${conversations.status} end`,
            version: sql`case when ${canReopen} then ${conversations.version} + 1 else ${conversations.version} end`,
          }),
          lastInboundAt: sql`greatest(${conversations.lastInboundAt}, ${sentAt}::timestamptz)`,
          lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${sentAt}::timestamptz)`,
          windowExpiresAt: sql`greatest(${conversations.windowExpiresAt}, ${expiry.toISOString()}::timestamptz)`,
          lastMessagePreview: sql`case when ${conversations.lastMessageAt} > ${sentAt}::timestamptz then ${conversations.lastMessagePreview} else ${preview} end`,
          unreadCount: sql`${conversations.unreadCount} + 1`,
          ...(referral && newerReferral(referral, sentAt)),
          updatedAt: now,
        })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId))),
    );
  }

  // A tap is the customer acting, so it keeps the window open like a message, but it adds no
  // message, preview or unread count.
  async recordTap(
    storeId: string,
    { conversationId, at, expiry }: { conversationId: string; at: Date; expiry: Date },
    now: Date,
  ) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({
          lastInboundAt: sql`greatest(${conversations.lastInboundAt}, ${at.toISOString()}::timestamptz)`,
          windowExpiresAt: sql`greatest(${conversations.windowExpiresAt}, ${expiry.toISOString()}::timestamptz)`,
          updatedAt: now,
        })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId))),
    );
  }

  // The Page where the contact wrote last, for a message that is not tied to one Page.
  async findLatestInbound(storeId: string, contactId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          connectionId: conversations.channelConnectionId,
          lastInboundAt: conversations.lastInboundAt,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.storeId, storeId),
            eq(conversations.contactId, contactId),
            eq(conversations.channel, 'messenger'),
            isNotNull(conversations.lastInboundAt),
          ),
        )
        .orderBy(desc(conversations.lastInboundAt))
        .limit(1),
    );
    return row;
  }

  findLastInbound(storeId: string, connectionId: string, contactIds: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ contactId: conversations.contactId, lastInboundAt: conversations.lastInboundAt })
        .from(conversations)
        .where(
          and(
            eq(conversations.storeId, storeId),
            eq(conversations.channelConnectionId, connectionId),
            inArray(conversations.contactId, contactIds),
          ),
        ),
    );
  }
}
