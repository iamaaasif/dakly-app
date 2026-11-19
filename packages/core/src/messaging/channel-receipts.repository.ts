import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import { messages } from '@dakly/db/schema/chats';
import type { ChannelReceipt } from '@dakly/providers/channel/channel-driver';

import { TenantDatabase } from '../platform/database/tenant-database';
import { SEND_UNCONFIRMED } from './outbound-messaging.repository';

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

function receiptMatch(receipt: ChannelReceipt) {
  if (receipt.kind === 'echo')
    return and(
      eq(messages.id, receipt.operationKey),
      eq(messages.externalId, receipt.externalMessageId),
    );
  return 'through' in receipt
    ? and(lte(messages.sentAt, receipt.through), lte(messages.sentAt, receipt.occurredAt))
    : inArray(messages.externalId, receipt.externalMessageIds);
}

@Injectable()
export class ChannelReceiptsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

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
            eq(messages.errorCode, SEND_UNCONFIRMED),
            lte(messages.createdAt, through),
          ),
        )
        .limit(1),
    );
    return pending !== undefined;
  }

  applyReceipt(storeId: string, thread: Thread, receipt: Receipt) {
    const read = receipt.kind === 'read';
    return this.database.forStore(storeId, (tx) =>
      tx
        .update(messages)
        .set({
          ...(read
            ? { status: 'read', readAt: receipt.occurredAt }
            : {
                status: sql`case when ${messages.status} = 'read' then 'read' else 'delivered' end`,
                deliveredAt: receipt.occurredAt,
              }),
        })
        .where(
          and(
            addressedTo(storeId, thread),
            receiptMatch(receipt),
            read
              ? inArray(messages.status, ['sent', 'delivered'])
              : and(inArray(messages.status, ['sent', 'read']), isNull(messages.deliveredAt)),
          ),
        )
        .returning({ id: messages.id }),
    );
  }

  async countMatches(storeId: string, thread: Thread, receipt: ChannelReceipt) {
    const [match] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ count: count() })
        .from(messages)
        .where(and(addressedTo(storeId, thread), receiptMatch(receipt))),
    );
    return match?.count ?? 0;
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
            eq(messages.errorCode, SEND_UNCONFIRMED),
          ),
        )
        .returning({ id: messages.id, body: messages.body }),
    );
    return message;
  }
}
