import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt } from 'drizzle-orm';

import type { SegmentGroup, SegmentListQuery } from '@dakly/contracts/segments';
import { segments } from '@dakly/db/schema/contacts';

import { databaseErrorCode } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

export type Segment = {
  id: string;
  name: string;
  rules: SegmentGroup;
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

  async findIdByName(storeId: string, name: string): Promise<string | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: segments.id })
        .from(segments)
        .where(and(eq(segments.storeId, storeId), eq(segments.name, name)))
        .limit(1),
    );
    return row?.id;
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
  ): Promise<Segment> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(segments)
        .values({ storeId, ...segment })
        .returning(segmentColumns),
    );
    return row!;
  }

  // A rename onto another segment's name is refused by the unique index, so concurrent renames
  // need no lock. The caller's transaction is then aborted and must roll back.
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
      if (isUniqueViolation(error, 'segments_store_id_name_key')) return 'name_taken';
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

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = error instanceof Error && error.cause ? error.cause : error;
  return (
    databaseErrorCode(error) === '23505' &&
    typeof cause === 'object' &&
    cause !== null &&
    'constraint' in cause &&
    cause.constraint === constraint
  );
}
