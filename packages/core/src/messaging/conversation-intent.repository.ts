import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { messages } from '@dakly/db/schema/chats';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ConversationIntentRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async customerBodies(storeId: string, conversationId: string, messageIds: string[]) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ body: messages.body })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.conversationId, conversationId),
            eq(messages.direction, 'in'),
            inArray(messages.id, messageIds),
          ),
        )
        .orderBy(asc(messages.createdAt)),
    );
    return rows.flatMap(({ body }) => (body ? [body] : []));
  }
}
