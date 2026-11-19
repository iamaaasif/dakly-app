import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';

import type {
  CreateSavedReplyInput,
  SavedReplyListQuery,
  UpdateSavedReplyInput,
} from '@dakly/contracts/saved-replies';
import { savedReplies } from '@dakly/db/schema/chats';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

const fields = {
  id: savedReplies.id,
  title: savedReplies.title,
  body: savedReplies.body,
  shortcut: savedReplies.shortcut,
  createdAt: savedReplies.createdAt,
  updatedAt: savedReplies.updatedAt,
};

@Injectable()
export class SavedRepliesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, { cursor, limit }: SavedReplyListQuery) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(fields)
        .from(savedReplies)
        .where(
          and(eq(savedReplies.storeId, storeId), cursor ? lt(savedReplies.id, cursor) : undefined),
        )
        .orderBy(desc(savedReplies.id))
        .limit(limit + 1),
    );
  }

  async create(storeId: string, userId: string, input: CreateSavedReplyInput, now: Date) {
    try {
      const [reply] = await this.database.forStore(storeId, (tx) =>
        tx
          .insert(savedReplies)
          .values({ ...input, storeId, createdByUserId: userId, createdAt: now, updatedAt: now })
          .returning(fields),
      );
      return reply;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'saved_replies_store_id_shortcut_key'))
        return undefined;
      throw error;
    }
  }

  async update(storeId: string, id: string, input: UpdateSavedReplyInput, now: Date) {
    try {
      const [reply] = await this.database.forStore(storeId, (tx) =>
        tx
          .update(savedReplies)
          .set({ ...input, updatedAt: now })
          .where(and(eq(savedReplies.storeId, storeId), eq(savedReplies.id, id)))
          .returning(fields),
      );
      return reply;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'saved_replies_store_id_shortcut_key'))
        return 'shortcut_taken' as const;
      throw error;
    }
  }

  async remove(storeId: string, id: string): Promise<boolean> {
    const [reply] = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(savedReplies)
        .where(and(eq(savedReplies.storeId, storeId), eq(savedReplies.id, id)))
        .returning({ id: savedReplies.id }),
    );
    return Boolean(reply);
  }
}
