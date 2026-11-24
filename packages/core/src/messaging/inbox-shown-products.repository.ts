import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { conversations, messages } from '@dakly/db/schema/chats';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class InboxShownProductsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // The AI replies of every chat this customer has, on any channel, newest first. A merged
  // customer's chats all belong to the kept contact, so a product shown on Messenger is found
  // when the same person writes on Instagram.
  shownProductHistory(storeId: string, conversationId: string, limit: number) {
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
            eq(messages.direction, 'out'),
            isNotNull(messages.aiSources),
            eq(
              conversations.contactId,
              sql`(select ${conversations.contactId} from ${conversations} where ${conversations.storeId} = ${storeId}::uuid and ${conversations.id} = ${conversationId}::uuid)`,
            ),
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit),
    );
  }
}
