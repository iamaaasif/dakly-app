import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt } from 'drizzle-orm';

import type { SegmentListQuery, SegmentRules } from '@dakly/contracts/segments';
import { segments } from '@dakly/db/schema/contacts';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

export type Segment = {
  id: string;
  name: string;
  rules: SegmentRules;
  createdAt: Date;
  updatedAt: Date;
};

const segmentColumns = {
  id: segments.id,
  name: segments.name,
  rules: segments.rules,
  createdAt: segments.createdAt,
  updatedAt: segments.updatedAt,
};

@Injectable()
export class SegmentsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, query: SegmentListQuery): Promise<Segment[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(segmentColumns)
        .from(segments)
        .where(
          and(
            eq(segments.storeId, storeId),
            query.cursor ? gt(segments.id, query.cursor) : undefined,
          ),
        )
        .orderBy(asc(segments.id))
        .limit(query.limit + 1),
    );
  }

  async find(storeId: string, id: string): Promise<Segment | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(segmentColumns)
        .from(segments)
        .where(and(eq(segments.storeId, storeId), eq(segments.id, id)))
        .limit(1),
    );
    return row;
  }

  async countSaved(storeId: string): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx.select({ count: count() }).from(segments).where(eq(segments.storeId, storeId)),
    );
    return row!.count;
  }

  async insert(
    storeId: string,
    segment: Pick<Segment, 'name' | 'rules'> & { createdByUserId: string | null },
  ): Promise<Segment | 'name_taken'> {
    try {
      const [row] = await this.database.forStore(storeId, (tx) =>
        tx
          .insert(segments)
          .values({ storeId, ...segment })
          .returning(segmentColumns),
      );
      return row!;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'segments_store_id_name_key')) return 'name_taken';
      throw error;
    }
  }

  // A name another segment has is refused by the unique index, so saves need no name lock. The
  // caller's transaction is then aborted and must roll back.
  async change(
    storeId: string,
    id: string,
    change: Partial<Pick<Segment, 'name' | 'rules'>> & Pick<Segment, 'updatedAt'>,
  ): Promise<Segment | 'name_taken' | undefined> {
    try {
      const [row] = await this.database.forStore(storeId, (tx) =>
        tx
          .update(segments)
          .set(change)
          .where(and(eq(segments.storeId, storeId), eq(segments.id, id)))
          .returning(segmentColumns),
      );
      return row;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'segments_store_id_name_key')) return 'name_taken';
      throw error;
    }
  }

  async remove(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(segments)
        .where(and(eq(segments.storeId, storeId), eq(segments.id, id)))
        .returning({ id: segments.id }),
    );
    return rows.length > 0;
  }
}
