import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import type {
  ChangeKnowledgeItemInput,
  CreateKnowledgeItemInput,
  ListKnowledgeItemsQuery,
} from '@dakly/contracts/knowledge';
import { knowledgeItems } from '@dakly/db/schema/ai';
import { files } from '@dakly/db/schema/platform';

import { TenantDatabase } from '../../platform/database/tenant-database';

const columns = {
  id: knowledgeItems.id,
  kind: knowledgeItems.kind,
  answer: knowledgeItems.answer,
  fileId: knowledgeItems.fileId,
  status: knowledgeItems.status,
  factsCount: knowledgeItems.factsCount,
  createdAt: knowledgeItems.createdAt,
  updatedAt: knowledgeItems.updatedAt,
};

export type KnowledgeItem = Pick<typeof knowledgeItems.$inferSelect, keyof typeof columns>;
@Injectable()
export class KnowledgeRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async create(
    storeId: string,
    userId: string,
    input: CreateKnowledgeItemInput,
    now: Date,
  ): Promise<KnowledgeItem> {
    const [item] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(knowledgeItems)
        .values({
          ...input,
          storeId,
          status: 'processing',
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning(columns),
    );
    return item!;
  }

  list(storeId: string, query: ListKnowledgeItemsQuery): Promise<KnowledgeItem[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.storeId, storeId),
            query.cursor ? gt(knowledgeItems.id, query.cursor) : undefined,
          ),
        )
        .orderBy(asc(knowledgeItems.id))
        .limit(query.limit + 1),
    );
  }

  async find(storeId: string, itemId: string): Promise<KnowledgeItem | undefined> {
    const [item] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(knowledgeItems)
        .where(and(eq(knowledgeItems.storeId, storeId), eq(knowledgeItems.id, itemId))),
    );
    return item;
  }

  async change(
    storeId: string,
    itemId: string,
    input: ChangeKnowledgeItemInput,
    now: Date,
  ): Promise<KnowledgeItem | undefined> {
    const [item] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(knowledgeItems)
        .set({
          ...input,
          factsCount: 0,
          status: 'processing',
          // Index writes compare this revision after returning from the model.
          updatedAt: sql`greatest(${knowledgeItems.updatedAt} + interval '1 millisecond', ${now.toISOString()}::timestamptz)`,
        })
        .where(
          and(
            eq(knowledgeItems.storeId, storeId),
            eq(knowledgeItems.id, itemId),
            eq(knowledgeItems.kind, 'fileId' in input ? 'file' : 'policy'),
          ),
        )
        .returning(columns),
    );
    return item;
  }

  async remove(storeId: string, itemId: string): Promise<boolean> {
    const removed = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(knowledgeItems)
        .where(and(eq(knowledgeItems.storeId, storeId), eq(knowledgeItems.id, itemId)))
        .returning({ id: knowledgeItems.id }),
    );
    return removed.length > 0;
  }

  async createFile(
    storeId: string,
    file: Pick<
      typeof files.$inferInsert,
      'id' | 'objectKey' | 'contentType' | 'sizeBytes' | 'uploadedByUserId' | 'createdAt'
    >,
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(files).values({ ...file, storeId, purpose: 'knowledge_file' }),
    );
  }

  async findFile(storeId: string, fileId: string) {
    const [file] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          status: files.status,
          objectKey: files.objectKey,
          contentType: files.contentType,
          sizeBytes: files.sizeBytes,
        })
        .from(files)
        .where(
          and(
            eq(files.storeId, storeId),
            eq(files.id, fileId),
            eq(files.purpose, 'knowledge_file'),
          ),
        ),
    );
    return file;
  }
}
