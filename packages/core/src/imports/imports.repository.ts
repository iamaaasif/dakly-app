import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type {
  ContactImportMapping,
  ImportConsentEvidence,
  ImportDuplicateMode,
  ImportStatus,
} from '@dakly/contracts/contacts';
import { imports } from '@dakly/db/schema/contacts';
import { files } from '@dakly/db/schema/platform';

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
  sizeBytes: number;
  expiresAt: Date;
};

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
  uploadKey: string;
  reportKey: string | null;
} & { [Count in keyof ImportCounts]: number | null };

export type StartedImport = Pick<
  typeof imports.$inferInsert,
  'columnMapping' | 'duplicateMode' | 'consentEvidence' | 'hasConsentConfirmation' | 'startedAt'
>;

@Injectable()
export class ImportsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  createCustomerImport(
    storeId: string,
    importId: string,
    upload: NewImportFile,
    createdByUserId: string | null,
  ): Promise<void> {
    return this.database.forStore(storeId, async (tx) => {
      await tx.insert(files).values({
        ...upload,
        storeId,
        purpose: 'import',
        contentType: 'text/csv',
        uploadedByUserId: createdByUserId,
      });
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
}

function guard(storeId: string, importId: string, status: ImportStatus) {
  return and(eq(imports.storeId, storeId), eq(imports.id, importId), eq(imports.status, status));
}
