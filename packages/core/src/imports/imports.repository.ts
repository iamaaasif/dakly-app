import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type {
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
  status: imports.status,
  columnMapping: sql<ContactImportMapping | null>`${imports.columnMapping}`,
  duplicateMode: imports.duplicateMode,
  consentEvidence: sql<ImportConsentEvidence | null>`${imports.consentEvidence}`,
  createdByUserId: imports.createdByUserId,
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
  id: string;
  status: ImportStatus;
  columnMapping: ContactImportMapping | null;
  duplicateMode: ImportDuplicateMode;
  consentEvidence: ImportConsentEvidence | null;
  createdByUserId: string | null;
  uploadFileId: string;
  uploadKey: string;
  reportKey: string | null;
} & { [Count in keyof ImportCounts]: number | null };

export type StartedImport = Pick<
  typeof imports.$inferInsert,
  'columnMapping' | 'duplicateMode' | 'consentEvidence' | 'hasConsentConfirmation' | 'startedAt'
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
        .where(and(eq(imports.storeId, storeId), eq(imports.id, importId)))
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
        .set({ claimedAt: lease })
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
    lease: { held: Date; renewed: Date },
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(imports)
        .set({ ...counts, claimedAt: lease.renewed })
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
    { lease, result, report }: { lease: Date | null; result: ImportResult; report?: NewImportFile },
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
        .where(and(guard(storeId, importId, 'importing'), held))
        .returning({ id: imports.id });
      if (rows.length === 0) return false;
      if (report) {
        await tx.insert(files).values({ ...report, storeId, purpose: 'import' });
        await tx
          .update(imports)
          .set({ reportFileId: report.id })
          .where(and(eq(imports.storeId, storeId), eq(imports.id, importId)));
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

  listStuck(storeId: string, before: Date): Promise<{ id: string; claimedAt: Date | null }[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: imports.id, claimedAt: imports.claimedAt })
        .from(imports)
        .where(
          and(
            eq(imports.storeId, storeId),
            eq(imports.status, 'importing'),
            lt(sql`coalesce(${imports.claimedAt}, ${imports.startedAt})`, before),
          ),
        ),
    );
  }
}

function guard(storeId: string, importId: string, status: ImportStatus) {
  return and(eq(imports.storeId, storeId), eq(imports.id, importId), eq(imports.status, status));
}
