import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import type { AiFeedbackQuery, RateAiReplyInput } from '@dakly/contracts/ai-feedback';
import { aiRatingReasons } from '@dakly/contracts/ai-feedback';
import { messages } from '@dakly/db/schema/chats';

import { TenantDatabase } from '../platform/database/tenant-database';

const FEEDBACK_LIMIT = 50;

@Injectable()
export class AiReplyFeedbackRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async rate(
    storeId: string,
    userId: string,
    messageId: string,
    input: RateAiReplyInput,
    now: Date,
  ) {
    const [rated] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(messages)
        .set({
          aiRating: input.rating,
          aiRatingReason: input.rating === 'bad' ? input.reason : null,
          ratedByUserId: userId,
          ratedAt: now,
        })
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.id, messageId),
            eq(messages.authorType, 'ai'),
          ),
        )
        .returning({ id: messages.id }),
    );
    return Boolean(rated);
  }

  async counts(storeId: string) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          rating: messages.aiRating,
          reason: messages.aiRatingReason,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(and(eq(messages.storeId, storeId), isNotNull(messages.aiRating)))
        .groupBy(messages.aiRating, messages.aiRatingReason),
    );
    return rows.map((row) => ({
      ...row,
      reason: aiRatingReasons.find((reason) => reason === row.reason) ?? null,
    }));
  }

  list(storeId: string, { filter }: AiFeedbackQuery) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          messageId: messages.id,
          rating: messages.aiRating,
          reason: messages.aiRatingReason,
          replyText: messages.body,
          ratedAt: messages.ratedAt,
          // Raw, qualified names: drizzle drops table names inside sql`` of a one-table select,
          // which makes the subquery columns ambiguous.
          customerName: sql<
            string | null
          >`(select c.name from conversations v join contacts c on c.store_id = v.store_id and c.id = v.contact_id where v.store_id = "messages"."store_id" and v.id = "messages"."conversation_id")`,
          // The latest thing the customer wrote before this reply.
          customerQuestion: sql<
            string | null
          >`(select q.body from messages q where q.store_id = "messages"."store_id" and q.conversation_id = "messages"."conversation_id" and q.author_type = 'customer' and q.created_at <= "messages"."created_at" order by q.created_at desc limit 1)`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.storeId, storeId),
            filter === 'all' ? isNotNull(messages.aiRating) : eq(messages.aiRating, filter),
          ),
        )
        .orderBy(desc(messages.ratedAt), desc(messages.id))
        .limit(FEEDBACK_LIMIT),
    );
  }
}
