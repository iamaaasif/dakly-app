import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, lte } from 'drizzle-orm';

import { conversations, messages } from '@dakly/db/schema/chats';
import { contactIdentities } from '@dakly/db/schema/contacts';
import type { ChannelReceipt } from '@dakly/providers/channel/channel-driver';

import { TenantDatabase } from '../platform/database/tenant-database';

type Thread = { conversationId: string; identityId: string };
type Receipt = Extract<ChannelReceipt, { kind: 'delivered' | 'read' }>;
type Echo = Extract<ChannelReceipt, { kind: 'echo' }>;

function addressedTo(storeId: string, thread: Thread) {
  return and(
    eq(messages.storeId, storeId),
    eq(messages.conversationId, thread.conversationId),
    eq(messages.recipientIdentityId, thread.identityId),
    eq(messages.direction, 'out'),
  );
}

@Injectable()
export class ChannelReceiptsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findThread(
    storeId: string,
    input: {
      connectionId: string;
      recipientExternalId: string;
      channel: ChannelReceipt['channel'];
    },
  ) {
    const [thread] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          conversationId: conversations.id,
          contactId: conversations.contactId,
          identityId: contactIdentities.id,
        })
        .from(contactIdentities)
        .innerJoin(
          conversations,
          and(
            eq(conversations.storeId, contactIdentities.storeId),
            eq(conversations.contactId, contactIdentities.contactId),
            eq(conversations.channelConnectionId, contactIdentities.channelConnectionId),
            eq(conversations.channel, contactIdentities.channel),
          ),
        )
        .where(
          and(
            eq(contactIdentities.storeId, storeId),
            eq(contactIdentities.channelConnectionId, input.connectionId),
            eq(contactIdentities.externalId, input.recipientExternalId),
            eq(contactIdentities.channel, input.channel),
          ),
        ),
    );
    return thread;
  }

  async hasPendingDispatch(storeId: string, thread: Thread, receipt: Receipt) {
    const through =
      'through' in receipt && receipt.through < receipt.occurredAt
        ? receipt.through
        : receipt.occurredAt;
    const [pending] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            addressedTo(storeId, thread),
            eq(messages.status, 'queued'),
            eq(messages.errorCode, 'send_unconfirmed'),
            lte(messages.createdAt, through),
          ),
        )
        .limit(1),
    );
    return pending !== undefined;
  }

  applyReceipt(storeId: string, thread: Thread, receipt: Receipt) {
    const read = receipt.kind === 'read';
    const match =
      'through' in receipt
        ? and(lte(messages.sentAt, receipt.through), lte(messages.sentAt, receipt.occurredAt))
        : inArray(messages.externalId, receipt.externalMessageIds);
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(messages)
        .set({
          status: receipt.kind,
          ...(read ? { readAt: receipt.occurredAt } : { deliveredAt: receipt.occurredAt }),
        })
        .where(
          and(
            addressedTo(storeId, thread),
            match,
            inArray(messages.status, read ? ['sent', 'delivered'] : ['sent']),
          ),
        )
        .returning({ id: messages.id }),
    );
  }

  async acceptEcho(storeId: string, thread: Thread, echo: Echo) {
    const [message] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(messages)
        .set({
          status: 'sent',
          externalId: echo.externalMessageId,
          sentAt: echo.occurredAt,
          errorCode: null,
        })
        .where(
          and(
            addressedTo(storeId, thread),
            eq(messages.id, echo.operationKey),
            eq(messages.status, 'queued'),
            eq(messages.errorCode, 'send_unconfirmed'),
          ),
        )
        .returning({ id: messages.id, body: messages.body }),
    );
    return message;
  }
}
