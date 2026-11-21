import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import type { DueEntryKind, DueEntrySource, DuePaymentMethod } from '@dakly/contracts/due-book';
import { dueEntries } from '@dakly/db/schema/due-book';

import { TenantDatabase } from '../platform/database/tenant-database';

export type DueEntry = {
  id: string;
  contactId: string;
  kind: DueEntryKind;
  amountPoisha: number;
  occurredAt: Date;
  method: DuePaymentMethod | null;
  note: string | null;
  source: DueEntrySource;
  recordedByUserId: string | null;
  createdAt: Date;
};

export type NewDueEntry = Omit<DueEntry, 'id' | 'createdAt'>;

export type DueHistoryRow = DueEntry & { balanceAfterPoisha: number };

export type HistoryCursor = { occurredAt: Date; id: string };

const dueEntryColumns = {
  id: dueEntries.id,
  contactId: dueEntries.contactId,
  kind: dueEntries.kind,
  amountPoisha: dueEntries.amountPoisha,
  occurredAt: dueEntries.occurredAt,
  method: dueEntries.method,
  note: dueEntries.note,
  source: dueEntries.source,
  recordedByUserId: dueEntries.recordedByUserId,
  createdAt: dueEntries.createdAt,
};

@Injectable()
export class DueEntriesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async insert(storeId: string, entry: NewDueEntry): Promise<DueEntry> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(dueEntries)
        .values({ storeId, ...entry })
        .returning(dueEntryColumns),
    );
    return rows[0]!;
  }

  async findById(storeId: string, id: string): Promise<DueEntry | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(dueEntryColumns)
        .from(dueEntries)
        .where(and(eq(dueEntries.storeId, storeId), eq(dueEntries.id, id))),
    );
    return row;
  }

  // Newest first. The running balance is each row's effect added up over every earlier row, so it
  // is computed before the cursor and the limit cut the list.
  history(
    storeId: string,
    contactId: string,
    page: { cursor?: HistoryCursor; limit: number },
  ): Promise<DueHistoryRow[]> {
    return this.database.forStore(storeId, async (tx) => {
      const running = tx.$with('running').as(
        tx
          .select({
            ...dueEntryColumns,
            balanceAfterPoisha:
              sql<number>`(sum(case when ${dueEntries.kind} = 'baki' then ${dueEntries.amountPoisha} else -${dueEntries.amountPoisha} end) over (order by ${dueEntries.occurredAt}, ${dueEntries.id}))::bigint`.as(
                'balance_after_poisha',
              ),
          })
          .from(dueEntries)
          .where(and(eq(dueEntries.storeId, storeId), eq(dueEntries.contactId, contactId))),
      );
      const rows = await tx
        .with(running)
        .select()
        .from(running)
        .where(
          page.cursor
            ? or(
                lt(running.occurredAt, page.cursor.occurredAt),
                and(eq(running.occurredAt, page.cursor.occurredAt), lt(running.id, page.cursor.id)),
              )
            : undefined,
        )
        .orderBy(desc(running.occurredAt), desc(running.id))
        .limit(page.limit);
      return rows.map((row) => ({ ...row, balanceAfterPoisha: Number(row.balanceAfterPoisha) }));
    });
  }
}
