import { gzipSync } from 'node:zlib';

import { Inject, Injectable } from '@nestjs/common';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { AuditArchiveRepository } from './audit-archive.repository';

const STORE_PAGE_SIZE = 100;
const CONTENT_TYPE = 'application/gzip';

// One object per store and month, kept for the life of the store: the store purge deletes
// everything under stores/<id>/ (D39).
export const auditArchiveKey = (storeId: string, month: string) =>
  `stores/${storeId}/archive/audit-log/${month}.jsonl.gz`;

@Injectable()
export class AuditArchiveService {
  constructor(
    @Inject(AuditArchiveRepository) private readonly repository: AuditArchiveRepository,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // A month is dropped only after every store's rows are in R2 and the exported count matches the
  // table. A crash anywhere earlier leaves the month in place, and the rerun writes the same keys.
  async archiveExpiredMonths() {
    for (const { partition, month } of await this.repository.expiredMonths()) {
      const exported = await this.exportMonth(partition, month);
      if (exported !== (await this.repository.rowCount(partition)))
        throw new Error(`Audit month ${month} changed while it was exported; leaving it in place`);
      await this.repository.dropPartition(partition);
    }
  }

  private async exportMonth(partition: string, month: string) {
    let exported = 0;
    let after: string | null = null;
    for (;;) {
      const storeIds = await this.repository.storeIds(partition, after, STORE_PAGE_SIZE);
      for (const storeId of storeIds) exported += await this.exportStore(partition, month, storeId);
      if (storeIds.length < STORE_PAGE_SIZE) return exported;
      after = storeIds.at(-1) ?? null;
    }
  }

  private async exportStore(partition: string, month: string, storeId: string) {
    const lines = await this.repository.storeRows(partition, storeId);
    const body = gzipSync(`${lines.join('\n')}\n`);
    const key = auditArchiveKey(storeId, month);
    await this.storage.writeBytes(key, body, CONTENT_TYPE);
    const stored = await this.storage.getObjectMetadata(key);
    if (stored?.sizeBytes !== body.byteLength)
      throw new Error(`Audit archive ${key} was not stored completely`);
    return lines.length;
  }
}
