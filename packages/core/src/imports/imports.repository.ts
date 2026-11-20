import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type {
  ContactImportField,
  ContactImportMapping,
  ImportConsentEvidence,
  ImportDuplicateMode,
  ImportStatus,
} from '@dakly/contracts/contacts';
import type { Database } from '@dakly/db/client';
import { imports } from '@dakly/db/schema/imports';
import { files } from '@dakly/db/schema/platform';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

export type ImportCounts = {
  rowsTotal: number;
  rowsAdded: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
};

export type ImportReportLine = {
  rowNumber?: number;
  field?: ContactImportField | 'sms' | 'whatsapp';
  message: string;
};

export type ImportCheckpoint = {
  processedRows: number;
  fileHash: string;
  report: ImportReportLine[];
  omittedRows: number;
};

export type NewImportFile = {
  id: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  status: 'pending' | 'ready';
  expiresAt: Date;
};

export type ImportResult = { status: 'done' | 'failed'; counts?: ImportCounts; finishedAt: Date };

const uploads = alias(files, 'uploads');
const reports = alias(files, 'reports');

const importColumns = {
  id: imports.id,
  checkpoint: sql<ImportCheckpoint | null>`${imports.checkpoint}`,
  status: imports.status,
  columnMapping: sql<ContactImportMapping | null>`${imports.columnMapping}`,
  duplicateMode: imports.duplicateMode,
  consentEvidence: sql<ImportConsentEvidence | null>`${imports.consentEvidence}`,
  createdByUserId: imports.createdByUserId,
  finishedAt: imports.finishedAt,
  undoFinishedAt: imports.undoFinishedAt,
  startedByUserId: imports.startedByUserId,
  rowsTotal: imports.rowsTotal,
  rowsAdded: imports.rowsAdded,
  rowsUpdated: imports.rowsUpdated,
  rowsSkipped: imports.rowsSkipped,
  rowsFailed: imports.rowsFailed,
  uploadFileId: uploads.id,
  uploadKey: uploads.objectKey,
  reportKey: reports.objectKey,
};

export type Import = {
  checkpoint: ImportCheckpoint | null;
  id: string;
  status: ImportStatus;
  columnMapping: ContactImportMapping | null;
  duplicateMode: ImportDuplicateMode;
  consentEvidence: ImportConsentEvidence | null;
  createdByUserId: string | null;
  finishedAt: Date | null;
  undoFinishedAt: Date | null;
  uploadFileId: string;
  startedByUserId: string | null;
  uploadKey: string;
  reportKey: string | null;
} & { [Count in keyof ImportCounts]: number | null };

export type StuckImport = Pick<
  Import,
  'id' | 'checkpoint' | 'columnMapping' | 'uploadKey' | 'uploadFileId'
> & { claimedAt: Date | null };

export type StartedImport = Pick<
  typeof imports.$inferInsert,
  | 'columnMapping'
  | 'duplicateMode'
  | 'consentEvidence'
  | 'hasConsentConfirmation'
  | 'startedAt'
  | 'startedByUserId'
>;

@Injectable()
export class ImportsRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  createCustomerImport(
    storeId: string,
    importId: string,
    upload: NewImportFile,
    createdByUserId: string | null,
  ): Promise<void> {
    return this.database.forStore(storeId, async (tx) => {
      await tx
        .insert(files)
        .values({ ...upload, storeId, purpose: 'import', uploadedByUserId: createdByUserId });
      await tx.insert(imports).values({
        id: importId,
        storeId,
        kind: 'customers_csv',
        fileId: upload.id,
        createdByUserId,
      });
    });
  }

  async findById(storeId: string, importId: string): Promise<Import | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(importColumns)
        .from(imports)
        .innerJoin(uploads, and(eq(uploads.storeId, storeId), eq(uploads.id, imports.fileId)))
        .leftJoin(reports, and(eq(reports.storeId, storeId), eq(reports.id, imports.reportFileId)))
        .where(and(customerImport(storeId), eq(imports.id, importId)))
        .limit(1),
    );
    return rows[0];
  }

  // Only an uploaded import starts, so a repeated start changes nothing.
  async start(storeId: string, importId: string, change: StartedImport): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ ...change, status: 'importing' })
        .where(guard(storeId, importId, 'uploaded'))
        .returning({ id: imports.id }),
    );
    return rows.length > 0;
  }

  // A run holds the import while its lease is fresh; a stale lease is taken over.
  async claim(storeId: string, importId: string, lease: Date, staleBefore: Date): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ claimedAt: lease, lastProgressAt: lease })
        .where(
          and(
            guard(storeId, importId, 'importing'),
            or(isNull(imports.claimedAt), lt(imports.claimedAt, staleBefore)),
          ),
        )
        .returning({ id: imports.id }),
    );
    return rows.length > 0;
  }

  async releaseClaim(storeId: string, importId: string, lease: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ claimedAt: null })
        .where(and(guard(storeId, importId, 'importing'), eq(imports.claimedAt, lease))),
    );
  }

  // Renews the lease with the counts so far; false when another run has taken the import over.
  async saveProgress(
    storeId: string,
    importId: string,
    counts: ImportCounts,
    lease: { held: Date; renewed: Date; checkpoint: ImportCheckpoint },
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({
          ...counts,
          checkpoint: lease.checkpoint,
          claimedAt: lease.renewed,
          lastProgressAt: lease.renewed,
        })
        .where(and(guard(storeId, importId, 'importing'), eq(imports.claimedAt, lease.held)))
        .returning({ id: imports.id }),
    );
    return rows.length > 0;
  }

  async markUploadReady(storeId: string, fileId: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(files)
        .set({ status: 'ready' })
        .where(and(eq(files.storeId, storeId), eq(files.id, fileId), eq(files.status, 'pending'))),
    );
  }

  // Finishes only while `lease` is still the import's lease; a null lease matches an import that
  // was never claimed. The report row is saved only when the import matched.
  finish(
    storeId: string,
    importId: string,
    {
      lease,
      result,
      report,
      exhausted,
    }: {
      lease: Date | null;
      result: ImportResult;
      report?: NewImportFile;
      exhausted?: { before: Date; limit: number };
    },
  ): Promise<boolean> {
    return this.database.forStore(storeId, async (tx) => {
      const held = lease ? eq(imports.claimedAt, lease) : isNull(imports.claimedAt);
      const rows = await tx
        .update(imports)
        .set({
          ...result.counts,
          status: result.status,
          finishedAt: result.finishedAt,
          claimedAt: null,
        })
        .where(
          and(
            guard(storeId, importId, 'importing'),
            held,
            exhausted ? stalled(storeId, exhausted.before) : undefined,
            exhausted ? gte(imports.requeueCount, exhausted.limit) : undefined,
          ),
        )
        .returning({ id: imports.id });
      if (rows.length === 0) return false;
      if (report) {
        await tx.insert(files).values({ ...report, storeId, purpose: 'import' });
        await tx
          .update(imports)
          .set({ reportFileId: report.id })
          .where(and(customerImport(storeId), eq(imports.id, importId)));
      }
      return true;
    });
  }

  // The sweep runs across stores without turning RLS off: the definer function names the stores,
  // and each store's imports are read as dakly_app.
  async storesWithStuckImports(before: Date): Promise<string[]> {
    const result = await this.global.execute<{ storeId: string }>(
      sql`select store_id as "storeId" from stores_with_stuck_imports(${before.toISOString()}::timestamptz)`,
    );
    return result.rows.map((row) => row.storeId);
  }

  // The last time a run made progress, or the start for an import no run has claimed yet.
  listStuck(storeId: string, before: Date): Promise<StuckImport[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: imports.id,
          claimedAt: imports.claimedAt,
          checkpoint: importColumns.checkpoint,
          columnMapping: importColumns.columnMapping,
          uploadKey: uploads.objectKey,
          uploadFileId: uploads.id,
        })
        .from(imports)
        .innerJoin(uploads, and(eq(uploads.storeId, storeId), eq(uploads.id, imports.fileId)))
        .where(stalled(storeId, before)),
    );
  }

  // Counts a re-queue and restarts the wait, so each re-queue gets a full interval.
  async requeue(
    storeId: string,
    importId: string,
    { before, now, limit }: { before: Date; now: Date; limit: number },
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ requeueCount: sql`${imports.requeueCount} + 1`, lastProgressAt: now })
        .where(
          and(stalled(storeId, before), eq(imports.id, importId), lt(imports.requeueCount, limit)),
        )
        .returning({ id: imports.id }),
    );
    return rows.length > 0;
  }

  // A finished or failed import moves to undone once, so a second undo changes nothing.
  async markUndone(storeId: string, importId: string, at: Date): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ status: 'undone', lastProgressAt: at })
        .where(
          and(
            customerImport(storeId),
            eq(imports.id, importId),
            inArray(imports.status, ['done', 'failed']),
          ),
        )
        .returning({ id: imports.id }),
    );
    return rows.length > 0;
  }

  async renewUndoProgress(storeId: string, importId: string, at: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ lastProgressAt: at })
        .where(and(guard(storeId, importId, 'undone'), isNull(imports.undoFinishedAt))),
    );
  }

  requeuePendingUndos(storeId: string, before: Date, now: Date): Promise<string[]> {
    return this.database.forStore(storeId, async (tx) => {
      const pending = tx
        .select({ id: imports.id })
        .from(imports)
        .where(
          and(
            customerImport(storeId),
            eq(imports.status, 'undone'),
            isNull(imports.undoFinishedAt),
            lt(sql`coalesce(${imports.lastProgressAt}, ${imports.finishedAt})`, before),
          ),
        )
        .orderBy(imports.id)
        .limit(100)
        .for('update', { skipLocked: true });
      const rows = await tx
        .update(imports)
        .set({ lastProgressAt: now })
        .where(and(customerImport(storeId), inArray(imports.id, pending)))
        .returning({ id: imports.id });
      return rows.map((row) => row.id);
    });
  }

  async markUndoFinished(storeId: string, importId: string, at: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ undoFinishedAt: at })
        .where(and(guard(storeId, importId, 'undone'), isNull(imports.undoFinishedAt))),
    );
  }
}

// Product imports share the table, so every customer import query names its kind.
function customerImport(storeId: string) {
  return and(eq(imports.storeId, storeId), eq(imports.kind, 'customers_csv'));
}

function stalled(storeId: string, before: Date) {
  return and(
    customerImport(storeId),
    eq(imports.status, 'importing'),
    lt(sql`coalesce(${imports.lastProgressAt}, ${imports.startedAt})`, before),
  );
}

function guard(storeId: string, importId: string, status: ImportStatus) {
  return and(customerImport(storeId), eq(imports.id, importId), eq(imports.status, status));
}
