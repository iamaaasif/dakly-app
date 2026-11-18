import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import type {
  ChangeKnowledgeItemInput,
  CreateKnowledgeItemInput,
  ListKnowledgeItemsQuery,
} from '@dakly/contracts/knowledge';
import { knowledgeChunks, knowledgeItems } from '@dakly/db/schema/ai';
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
export type KnowledgeChunk = Pick<
  typeof knowledgeChunks.$inferInsert,
  'content' | 'embedding' | 'embeddingModel' | 'tokenCount'
>;

export type KnowledgeHit = { itemId: string; content: string };

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

  async finishIndex(
    storeId: string,
    itemId: string,
    revision: Date,
    index: { chunks: readonly KnowledgeChunk[] } | { rejection: string },
  ): Promise<boolean> {
    return this.database.forStore(storeId, async (tx) => {
      const chunks = 'chunks' in index ? index.chunks : [];
      const rejection = 'rejection' in index ? index.rejection : null;
      const [item] = await tx
        .update(knowledgeItems)
        .set({
          status: rejection ? 'failed' : 'active',
          factsCount: chunks.length,
        })
        .where(
          and(
            eq(knowledgeItems.storeId, storeId),
            eq(knowledgeItems.id, itemId),
            eq(knowledgeItems.updatedAt, revision),
            eq(knowledgeItems.status, 'processing'),
          ),
        )
        .returning({ fileId: knowledgeItems.fileId });
      if (!item) return false;
      await tx
        .delete(knowledgeChunks)
        .where(
          and(eq(knowledgeChunks.storeId, storeId), eq(knowledgeChunks.knowledgeItemId, itemId)),
        );
      if (chunks.length)
        await tx
          .insert(knowledgeChunks)
          .values(chunks.map((chunk) => ({ ...chunk, storeId, knowledgeItemId: itemId })));
      if (item.fileId)
        await tx
          .update(files)
          .set({ status: rejection ? 'rejected' : 'ready', rejectReason: rejection })
          .where(
            and(
              eq(files.id, item.fileId),
              eq(files.storeId, storeId),
              eq(files.purpose, 'knowledge_file'),
            ),
          );
      return true;
    });
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

  async search(
    storeId: string,
    input: { query: string; embedding: readonly number[]; model: string; limit: number },
  ): Promise<KnowledgeHit[]> {
    const { query, embedding, model, limit } = input;
    const vector = JSON.stringify(embedding);
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<KnowledgeHit>(sql`
        WITH eligible AS (
          SELECT chunk.id, chunk.knowledge_item_id, chunk.content,
            chunk.embedding <=> ${vector}::vector AS distance,
            to_tsvector('simple', chunk.content) AS document
          FROM knowledge_chunks chunk
          JOIN knowledge_items item
            ON item.store_id = chunk.store_id AND item.id = chunk.knowledge_item_id
          WHERE chunk.store_id = ${storeId} AND item.status = 'active'
            AND chunk.embedding_model = ${model}
        ),
        terms AS (
          SELECT plainto_tsquery('simple', ${query}) AS text
        ),
        ranks AS (
          SELECT id, row_number() OVER (ORDER BY distance, id) AS rank FROM eligible
          UNION ALL
          SELECT id, row_number() OVER (ORDER BY ts_rank_cd(document, terms.text) DESC, id)
          FROM eligible CROSS JOIN terms WHERE document @@ terms.text
        ),
        scores AS (
          SELECT id, sum(1.0 / (60 + rank)) AS score FROM ranks GROUP BY id
        )
        SELECT eligible.knowledge_item_id AS "itemId", eligible.content
        FROM scores JOIN eligible USING (id)
        ORDER BY scores.score DESC, eligible.id
        LIMIT ${limit}
      `),
    );
    return result.rows;
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
