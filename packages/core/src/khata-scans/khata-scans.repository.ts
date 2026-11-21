import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';

import type {
  KhataFailureCode,
  KhataMatchKind,
  KhataPageStatus,
  KhataRowKind,
} from '@dakly/contracts/khata-scans';
import { khataPages, khataRows } from '@dakly/db/schema/khata-scans';
import { files } from '@dakly/db/schema/platform';

import { TenantDatabase } from '../platform/database/tenant-database';

export type KhataPage = {
  id: string;
  status: KhataPageStatus;
  failureCode: KhataFailureCode | null;
  createdAt: Date;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  photoExpiresAt: Date | null;
};
export type NewKhataPage = {
  id: string;
  fileId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  photoExpiresAt: Date;
  createdByUserId: string;
};
export type NewKhataRow = {
  rowNumber: number;
  entryDate: string | null;
  name: string;
  phone: string | null;
  item: string | null;
  amountPoisha: number;
  kind: KhataRowKind;
  confidence: number;
  matchedContactId: string | null;
  matchKind: KhataMatchKind | null;
};
export type StoredKhataRow = typeof khataRows.$inferSelect;

const pageColumns = {
  id: khataPages.id,
  status: khataPages.status,
  failureCode: khataPages.failureCode,
  createdAt: khataPages.createdAt,
  objectKey: files.objectKey,
  contentType: files.contentType,
  sizeBytes: files.sizeBytes,
  photoExpiresAt: files.expiresAt,
};

@Injectable()
export class KhataScansRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  insertPage(storeId: string, page: NewKhataPage): Promise<void> {
    return this.database.forStore(storeId, async (tx) => {
      await tx.insert(files).values({
        id: page.fileId,
        storeId,
        purpose: 'khata_page',
        objectKey: page.objectKey,
        contentType: page.contentType,
        sizeBytes: page.sizeBytes,
        status: 'pending',
        uploadedByUserId: page.createdByUserId,
        expiresAt: page.photoExpiresAt,
      });
      await tx.insert(khataPages).values({
        id: page.id,
        storeId,
        fileId: page.fileId,
        createdByUserId: page.createdByUserId,
      });
    });
  }

  async findPage(storeId: string, pageId: string): Promise<KhataPage | undefined> {
    const [page] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(pageColumns)
        .from(khataPages)
        .innerJoin(
          files,
          and(eq(files.storeId, khataPages.storeId), eq(files.id, khataPages.fileId)),
        )
        .where(and(eq(khataPages.storeId, storeId), eq(khataPages.id, pageId))),
    );
    return page;
  }

  listPages(storeId: string, limit: number, cursor?: string): Promise<KhataPage[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(pageColumns)
        .from(khataPages)
        .innerJoin(
          files,
          and(eq(files.storeId, khataPages.storeId), eq(files.id, khataPages.fileId)),
        )
        .where(and(eq(khataPages.storeId, storeId), cursor ? lt(khataPages.id, cursor) : undefined))
        .orderBy(desc(khataPages.id))
        .limit(limit),
    );
  }

  async rowsForPages(storeId: string, pageIds: string[]): Promise<StoredKhataRow[]> {
    if (pageIds.length === 0) return [];
    return this.database.forStore(storeId, (tx) =>
      tx
        .select()
        .from(khataRows)
        .where(and(eq(khataRows.storeId, storeId), inArray(khataRows.pageId, pageIds)))
        .orderBy(khataRows.pageId, khataRows.rowNumber),
    );
  }

  // Queues a page that was uploaded, or that failed earlier and is tried again.
  async markQueued(storeId: string, pageId: string): Promise<boolean> {
    return this.database.forStore(storeId, async (tx) => {
      const updated = await tx
        .update(khataPages)
        .set({ status: 'reading', failureCode: null, claimedAt: null })
        .where(
          and(
            eq(khataPages.storeId, storeId),
            eq(khataPages.id, pageId),
            inArray(khataPages.status, ['uploaded', 'failed']),
          ),
        )
        .returning({ fileId: khataPages.fileId });
      const [queued] = updated;
      if (!queued) return false;
      await tx
        .update(files)
        .set({ status: 'ready' })
        .where(and(eq(files.storeId, storeId), eq(files.id, queued.fileId)));
      return true;
    });
  }

  // Only a queued page, or one whose reader stopped renewing its lease, can be claimed.
  async claim(storeId: string, pageId: string, now: Date, staleBefore: Date): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(khataPages)
        .set({ claimedAt: now })
        .where(
          and(
            eq(khataPages.storeId, storeId),
            eq(khataPages.id, pageId),
            eq(khataPages.status, 'reading'),
            or(isNull(khataPages.claimedAt), lt(khataPages.claimedAt, staleBefore)),
          ),
        )
        .returning({ id: khataPages.id }),
    );
    return rows.length === 1;
  }

  // A rerun after a crash replaces the rows instead of adding them twice.
  saveRead(storeId: string, pageId: string, rows: NewKhataRow[]): Promise<void> {
    return this.database.forStore(storeId, async (tx) => {
      await tx
        .delete(khataRows)
        .where(and(eq(khataRows.storeId, storeId), eq(khataRows.pageId, pageId)));
      if (rows.length > 0)
        await tx.insert(khataRows).values(rows.map((row) => ({ ...row, storeId, pageId })));
      await tx
        .update(khataPages)
        .set({ status: 'read', claimedAt: null })
        .where(and(eq(khataPages.storeId, storeId), eq(khataPages.id, pageId)));
    });
  }

  async finish(
    storeId: string,
    pageId: string,
    outcome: { status: 'unreadable' } | { status: 'failed'; failureCode: KhataFailureCode },
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(khataPages)
        .set({
          status: outcome.status,
          failureCode: outcome.status === 'failed' ? outcome.failureCode : null,
          claimedAt: null,
        })
        .where(and(eq(khataPages.storeId, storeId), eq(khataPages.id, pageId))),
    );
  }
}
