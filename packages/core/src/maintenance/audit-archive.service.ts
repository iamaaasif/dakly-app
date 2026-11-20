import { createGzip } from 'node:zlib';

import { Inject, Injectable } from '@nestjs/common';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { StoresService } from '../stores/stores.service';
import { AuditArchiveRepository } from './audit-archive.repository';
import { maintenanceError } from './maintenance.errors';

const STORE_PAGE_SIZE = 100;
const ROW_PAGE_SIZE = 5000;
const CONTENT_TYPE = 'application/gzip';

// One object per store and month, kept for the life of the store: the store purge deletes
// everything under stores/<id>/ (D39).
export const auditArchiveKey = (storeId: string, month: string) =>
  `stores/${storeId}/archive/audit-log/${month.slice(0, 7)}.jsonl.gz`;

@Injectable()
export class AuditArchiveService {
  constructor(
    @Inject(AuditArchiveRepository) private readonly repository: AuditArchiveRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // A month is dropped only after every store's rows are in R2, and the database refuses the drop
  // unless the exported count matches the partition. A crash earlier leaves the month in place,
  // and the rerun writes the same keys again.
  async archiveExpiredMonths() {
    for (const month of await this.repository.expiredMonths()) {
      const exported = await this.exportMonth(month);
      await this.repository.dropMonth(month, exported);
    }
  }

  private async exportMonth(month: string) {
    let exported = 0;
    let after: string | null = null;
    for (;;) {
      const storeIds = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      for (const storeId of storeIds) exported += await this.exportStore(storeId, month);
      if (storeIds.length < STORE_PAGE_SIZE) return exported;
      after = storeIds.at(-1) ?? null;
    }
  }

  // Rows go through one gzip stream a page at a time, so only compressed bytes pile up.
  private async exportStore(storeId: string, month: string) {
    const gzip = createGzip();
    const chunks: Buffer[] = [];
    const finished = new Promise<void>((resolve, reject) => {
      gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gzip.on('end', resolve);
      gzip.on('error', reject);
    });
    let rows = 0;
    let cursor = null;
    do {
      const page = await this.repository.storeRowsPage(storeId, month, cursor, ROW_PAGE_SIZE);
      if (page.lines.length > 0) gzip.write(`${page.lines.join('\n')}\n`);
      rows += page.lines.length;
      cursor = page.next;
    } while (cursor);
    gzip.end();
    await finished;
    if (rows === 0) return 0;

    const body = Buffer.concat(chunks);
    const key = auditArchiveKey(storeId, month);
    await this.storage.writeBytes(key, body, CONTENT_TYPE);
    const stored = await this.storage.getObjectMetadata(key);
    if (stored?.sizeBytes !== body.byteLength)
      throw maintenanceError('MAINTENANCE_ARCHIVE_INCOMPLETE');
    return rows;
  }
}
