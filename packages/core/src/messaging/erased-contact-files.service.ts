import { Inject, Injectable } from '@nestjs/common';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';

@Injectable()
export class ErasedContactFilesService {
  constructor(@Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver) {}

  // Runs after the erasure commits and may repeat: deleting a missing object is not an error.
  // Only keys inside the store's own folder are touched, whatever the message rows said.
  async deleteFiles(storeId: string, conversationIds: string[], attachmentKeys: string[]) {
    const folder = `stores/${storeId}/`;
    for (const key of attachmentKeys) {
      if (key.startsWith(folder)) await this.storage.deleteObject(key);
    }
    if (conversationIds.length === 0) return;
    // Archive objects are named by conversation and month, so the months are found by listing.
    const archived = new Set(conversationIds.map((id) => `/${id}.jsonl.gz`));
    let token: string | undefined;
    do {
      const page = await this.storage.listObjects(`${folder}archive/messages/`, token);
      for (const { key } of page.objects) {
        if ([...archived].some((suffix) => key.endsWith(suffix))) {
          await this.storage.deleteObject(key);
        }
      }
      token = page.nextToken ?? undefined;
    } while (token);
  }
}
