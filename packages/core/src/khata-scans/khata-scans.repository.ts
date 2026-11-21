import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import {
  type KhataFailureCode,
  type KhataImportStatus,
  type KhataMatchKind,
  type KhataPageContentType,
  type KhataPageStatus,
  type KhataRowKind,
  type KhataRowOutcome,
  khataPageContentTypeSchema,
} from '@dakly/contracts/khata-scans';
import { khataImports, khataPages, khataRows } from '@dakly/db/schema/khata-scans';
import { files } from '@dakly/db/schema/platform';

import { TenantDatabase } from '../platform/database/tenant-database';

export type KhataPage = {
  id: string;
  status: KhataPageStatus;
  failureCode: KhataFailureCode | null;
  createdAt: Date;
  // All four are null once the 30-day photo purge has run.
  objectKey: string | null;
  contentType: KhataPageContentType | null;
  sizeBytes: number | null;
  photoExpiresAt: Date | null;
};
export type KhataImport = {
  id: string;
  pageId: string;
  status: KhataImportStatus;
  rowsRead: number;
  rowsImported: number;
  rowsSkipped: number;
  customersCreated: number;
  createdAt: Date;
};
export type RowOutcome = {
  rowId: string;
  outcome: KhataRowOutcome;
  contactId: string | null;
  isContactCreated: boolean;
  dueEntryId: string | null;
  orderId: string | null;
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

// The file row stores the type as text; only the upload route writes it, from the same union.
function toPage(row: Omit<KhataPage, 'contentType'> & { contentType: string | null }): KhataPage {
  return {
    ...row,
    contentType: row.contentType ? khataPageContentTypeSchema.parse(row.contentType) : null,
  };
}

const importColumns = {
  id: khataImports.id,
  pageId: khataImports.pageId,
  status: khataImports.status,
  rowsRead: khataImports.rowsRead,
  rowsImported: khataImports.rowsImported,
  rowsSkipped: khataImports.rowsSkipped,
  customersCreated: khataImports.customersCreated,
  createdAt: khataImports.createdAt,
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
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(pageColumns)
        .from(khataPages)
        .leftJoin(
          files,
          and(eq(files.storeId, khataPages.storeId), sql`${files.id} = ${khataPages.fileId}`),
        )
        .where(and(eq(khataPages.storeId, storeId), eq(khataPages.id, pageId))),
    );
    return row && toPage(row);
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
      if (!queued?.fileId) return false;
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

  // Lets the next delivery of the job take the page without waiting for the lease to run out.
  async releaseClaim(storeId: string, pageId: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(khataPages)
        .set({ claimedAt: null })
        .where(and(eq(khataPages.storeId, storeId), eq(khataPages.id, pageId))),
    );
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

  async hasDoneImport(storeId: string, pageId: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: khataImports.id })
        .from(khataImports)
        .where(
          and(
            eq(khataImports.storeId, storeId),
            eq(khataImports.pageId, pageId),
            eq(khataImports.status, 'done'),
          ),
        ),
    );
    return rows.length > 0;
  }

  async insertImport(
    storeId: string,
    entry: { id: string; pageId: string; rowsRead: number; createdByUserId: string },
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(khataImports)
        .values({ ...entry, storeId, rowsImported: 0, rowsSkipped: 0, customersCreated: 0 }),
    );
  }

  async saveImportResult(
    storeId: string,
    importId: string,
    outcomes: RowOutcome[],
    counts: { rowsImported: number; rowsSkipped: number; customersCreated: number },
  ): Promise<KhataImport> {
    return this.database.forStore(storeId, async (tx) => {
      for (const outcome of outcomes)
        await tx
          .update(khataRows)
          .set({
            importId,
            outcome: outcome.outcome,
            contactId: outcome.contactId,
            isContactCreated: outcome.isContactCreated,
            dueEntryId: outcome.dueEntryId,
            orderId: outcome.orderId,
          })
          .where(and(eq(khataRows.storeId, storeId), eq(khataRows.id, outcome.rowId)));
      const [saved] = await tx
        .update(khataImports)
        .set(counts)
        .where(and(eq(khataImports.storeId, storeId), eq(khataImports.id, importId)))
        .returning(importColumns);
      return saved!;
    });
  }

  async findImport(storeId: string, importId: string): Promise<KhataImport | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(importColumns)
        .from(khataImports)
        .where(and(eq(khataImports.storeId, storeId), eq(khataImports.id, importId))),
    );
    return row;
  }

  // The shop's latest imports, newest first. One import is one page.
  listImports(storeId: string, limit: number): Promise<KhataImport[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(importColumns)
        .from(khataImports)
        .where(eq(khataImports.storeId, storeId))
        .orderBy(desc(khataImports.createdAt), desc(khataImports.id))
        .limit(limit),
    );
  }

  // Rows of an import that made something. Skipped rows made nothing.
  importedRows(storeId: string, importId: string): Promise<StoredKhataRow[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select()
        .from(khataRows)
        .where(
          and(
            eq(khataRows.storeId, storeId),
            eq(khataRows.importId, importId),
            eq(khataRows.outcome, 'imported'),
          ),
        ),
    );
  }

  // Undo gives the page back to the owner as read and not yet decided.
  async resetPageRows(storeId: string, pageId: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(khataRows)
        .set({
          importId: null,
          outcome: null,
          contactId: null,
          isContactCreated: false,
          dueEntryId: null,
          orderId: null,
        })
        .where(and(eq(khataRows.storeId, storeId), eq(khataRows.pageId, pageId))),
    );
  }

  async markUndone(storeId: string, importId: string, undoneAt: Date): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(khataImports)
        .set({ status: 'undone', undoneAt })
        .where(
          and(
            eq(khataImports.storeId, storeId),
            eq(khataImports.id, importId),
            eq(khataImports.status, 'done'),
          ),
        )
        .returning({ id: khataImports.id }),
    );
    return rows.length === 1;
  }
}
