import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { conversations, messages } from '@dakly/db/schema/chats';

import { TenantDatabase } from '../platform/database/tenant-database';
import type { OutgoingChannelMessage } from './outgoing-channel-message';

type SendOutcome =
  | { status: 'sent'; externalId: string; sentAt: Date; errorCode: null }
  | { status: 'failed'; errorCode: string };

// The worker claims a queued send with this marker before it calls Meta.
// A queued row that keeps the marker waits for reconciliation.
export const SEND_UNCONFIRMED = 'send_unconfirmed';

function queuedMessage(storeId: string, messageId: string) {
  return and(
    eq(messages.storeId, storeId),
    eq(messages.id, messageId),
    eq(messages.status, 'queued'),
  );
}

@Injectable()
export class OutboundMessagingRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findConversation(
    storeId: string,
    {
      contactId,
      connectionId,
      channel,
    }: Pick<OutgoingChannelMessage, 'contactId' | 'connectionId' | 'channel'>,
  ) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.storeId, storeId),
            eq(conversations.contactId, contactId),
            eq(conversations.channelConnectionId, connectionId),
            eq(conversations.channel, channel),
          ),
        ),
    );
    return row;
  }

  async queue(
    storeId: string,
    input: Pick<
      OutgoingChannelMessage,
      'actor' | 'content' | 'identityId' | 'category' | 'aiSources'
    > & {
      conversationId: string;
      idempotencyKey: string;
    },
    now: Date,
  ) {
    return this.database.forStore(storeId, async (tx) => {
      const { actor, content, conversationId, idempotencyKey } = input;
      const authorUserId = actor.kind === 'user' ? actor.userId : null;
      const aiRunId = actor.kind === 'ai' ? actor.aiRunId : null;
      const [inserted] = await tx
        .insert(messages)
        .values({
          storeId,
          conversationId,
          idempotencyKey,
          recipientIdentityId: input.identityId,
          sendCategory: input.category,
          body: content,
          authorType: actor.kind,
          authorUserId,
          aiRunId,
          aiSources: input.aiSources,
          direction: 'out',
          kind: 'text',
          status: 'queued',
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: messages.id });
      if (inserted) return { message: inserted, created: true };
      const [existing] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.idempotencyKey, idempotencyKey),
            eq(messages.direction, 'out'),
            eq(messages.conversationId, conversationId),
            eq(messages.recipientIdentityId, input.identityId),
            eq(messages.sendCategory, input.category),
            eq(messages.body, content),
            eq(messages.authorType, actor.kind),
            sql`${messages.authorUserId} is not distinct from ${authorUserId}::uuid`,
            sql`${messages.aiRunId} is not distinct from ${aiRunId}::uuid`,
          ),
        );
      return { message: existing, created: false };
    });
  }

  async findForDispatch(storeId: string, messageId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          identityId: messages.recipientIdentityId,
          category: messages.sendCategory,
          authorType: messages.authorType,
          contactId: conversations.contactId,
          connectionId: conversations.channelConnectionId,
          channel: conversations.channel,
          lastInboundAt: conversations.lastInboundAt,
          windowExpiresAt: conversations.windowExpiresAt,
        })
        .from(messages)
        .innerJoin(
          conversations,
          and(
            eq(conversations.id, messages.conversationId),
            eq(conversations.storeId, messages.storeId),
          ),
        )
        .where(
          and(
            queuedMessage(storeId, messageId),
            eq(messages.direction, 'out'),
            eq(messages.kind, 'text'),
            isNull(messages.errorCode),
          ),
        ),
    );
    return row;
  }

  async markAttempt(storeId: string, messageId: string) {
    const [updated] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(messages)
        .set({ errorCode: SEND_UNCONFIRMED })
        .where(and(queuedMessage(storeId, messageId), isNull(messages.errorCode)))
        .returning({ id: messages.id }),
    );
    return updated !== undefined;
  }

  async finish(
    storeId: string,
    messageId: string,
    outcome: SendOutcome,
    stage: 'unclaimed' | 'attempted',
  ) {
    const [updated] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(messages)
        .set(outcome)
        .where(
          and(
            queuedMessage(storeId, messageId),
            stage === 'attempted'
              ? eq(messages.errorCode, SEND_UNCONFIRMED)
              : isNull(messages.errorCode),
          ),
        )
        .returning({ id: messages.id }),
    );
    return updated !== undefined;
  }

  advanceConversation(
    storeId: string,
    conversationId: string,
    { at, preview }: { at: Date; preview: string },
  ) {
    const timestamp = at.toISOString();
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(conversations)
        .set({
          lastOutboundAt: sql`greatest(${conversations.lastOutboundAt}, ${timestamp}::timestamptz)`,
          lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${timestamp}::timestamptz)`,
          lastMessagePreview: sql`case when ${conversations.lastMessageAt} is null or
            ${conversations.lastMessageAt} <= ${timestamp}::timestamptz then ${preview}
            else ${conversations.lastMessagePreview} end`,
          updatedAt: sql`greatest(${conversations.updatedAt}, ${timestamp}::timestamptz)`,
        })
        .where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId))),
    );
  }
}
