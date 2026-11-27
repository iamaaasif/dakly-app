import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm';

import { conversations, messages } from '@dakly/db/schema/chats';
import { contacts } from '@dakly/db/schema/contacts';
import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

// The AI writes this source on a reply that puts products in front of the customer.
const shownProductsSource = 'shown_products';
const buyingIntents = ['price', 'size_or_stock', 'order', 'confirm'] as const;

export type InquiryFilter = { contactIds?: string[] };

// A chat is an inquiry while the customer showed buying intent and has made no order since their
// last message. A cancelled order does not end it.
function inquiryCondition(storeId: string, { contactIds }: InquiryFilter): SQL | undefined {
  const orderedSince = sql`exists (
    select 1 from ${orders}
    where ${orders.storeId} = ${conversations.storeId}
      and ${orders.stage} <> 'cancelled'
      and (${orders.conversationId} = ${conversations.id} or ${orders.buyerContactId} = ${conversations.contactId})
      and ${orders.createdAt} >= coalesce(${conversations.lastInboundAt}, ${conversations.createdAt})
  )`;
  return and(
    eq(conversations.storeId, storeId),
    ne(contacts.kind, 'not_customer'),
    inArray(conversations.status, ['open', 'needs_you', 'later']),
    sql`(${conversations.hasBuyingInterest} or ${inArray(conversations.intentTag, [...buyingIntents])})`,
    sql`not ${orderedSince}`,
    contactIds ? inArray(conversations.contactId, contactIds) : undefined,
  );
}

@Injectable()
export class OrderInquiriesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, filter: InquiryFilter, page: { offset: number; limit: number }) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          conversationId: conversations.id,
          contactId: conversations.contactId,
          contactName: contacts.name,
          channel: conversations.channel,
          lastMessageAt: conversations.lastMessageAt,
          isVip: sql<boolean>`'vip' = any(${contacts.tags})`,
          hasEarlierOrder: sql<boolean>`exists (
            select 1 from ${orders}
            where ${orders.storeId} = ${conversations.storeId}
              and ${orders.buyerContactId} = ${conversations.contactId}
              and ${orders.stage} <> 'cancelled'
          )`,
        })
        .from(conversations)
        .innerJoin(
          contacts,
          and(
            eq(contacts.storeId, conversations.storeId),
            eq(contacts.id, conversations.contactId),
          ),
        )
        .where(inquiryCondition(storeId, filter))
        .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.id))
        .limit(page.limit + 1)
        .offset(page.offset),
    );
  }

  async count(storeId: string): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(conversations)
        .innerJoin(
          contacts,
          and(
            eq(contacts.storeId, conversations.storeId),
            eq(contacts.id, conversations.contactId),
          ),
        )
        .where(inquiryCondition(storeId, {})),
    );
    return row?.total ?? 0;
  }

  // The newest reply of each chat that showed a product.
  latestShownProducts(storeId: string, conversationIds: string[]) {
    if (!conversationIds.length) return Promise.resolve([]);
    return this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinctOn([messages.conversationId], {
          conversationId: messages.conversationId,
          aiSources: messages.aiSources,
        })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            inArray(messages.conversationId, conversationIds),
            eq(messages.direction, 'out'),
            isNotNull(messages.aiSources),
            sql`${messages.aiSources} @> ${JSON.stringify([{ tool: shownProductsSource }])}::jsonb`,
          ),
        )
        .orderBy(messages.conversationId, desc(messages.createdAt), desc(messages.id)),
    );
  }
}
