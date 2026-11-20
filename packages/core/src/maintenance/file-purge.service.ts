import { Inject, Injectable } from '@nestjs/common';

import type {
  FileStorageDriver,
  ListedObject,
} from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../platform/clock';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { HOUR_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { FilePurgeRepository } from './file-purge.repository';

const STORE_PAGE_SIZE = 100;
const FILE_BATCH = 500;
// A photo is uploaded before its files row is confirmed, so a new object may not have a row yet.
const UPLOAD_GRACE_MS = 24 * HOUR_MS;

@Injectable()
export class FilePurgeService {
  constructor(
    @Inject(FilePurgeRepository) private readonly repository: FilePurgeRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // The rows go first, in their own transaction, then the objects. A row that something still
  // points at fails the batch before R2 is touched. A crash in between leaves a stray object, which
  // costs little and, under products/, the orphan sweep removes. No transaction stays open while
  // R2 is called, and deleting a missing object is not an error.
  purgeExpiredFiles() {
    return this.forEachStore(async (storeId) => {
      for (;;) {
        const keys = await this.repository.deleteExpiredBatch(storeId, FILE_BATCH);
        for (const key of keys) await this.storage.deleteObject(key);
        if (keys.length < FILE_BATCH) return;
      }
    });
  }

  // Product photos whose upload was never confirmed, so no files row names them.
  purgeOrphanProductObjects() {
    return this.forEachStore(async (storeId) => {
      const cutoff = this.clock.now().getTime() - UPLOAD_GRACE_MS;
      let token: string | undefined;
      do {
        const page = await this.storage.listObjects(`stores/${storeId}/products/`, token);
        await this.deleteOrphans(storeId, page.objects, cutoff);
        token = page.nextToken ?? undefined;
      } while (token);
    });
  }

  private async deleteOrphans(storeId: string, objects: ListedObject[], cutoff: number) {
    const old = objects.filter(({ lastModified }) => lastModified.getTime() < cutoff);
    if (old.length === 0) return;
    const known = await this.repository.knownKeys(
      storeId,
      old.map(({ key }) => key),
    );
    for (const { key } of old) if (!known.has(key)) await this.storage.deleteObject(key);
  }

  private async forEachStore(work: (storeId: string) => Promise<void>) {
    let after: string | null = null;
    for (;;) {
      const page = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      for (const storeId of page) await work(storeId);
      if (page.length < STORE_PAGE_SIZE) return;
      after = page.at(-1) ?? null;
    }
  }
}
