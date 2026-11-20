import { createGzip } from 'node:zlib';

import { Inject, Injectable } from '@nestjs/common';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import {
  type ArchiveGroup,
  MessageArchiveRepository,
  type MessagePageCursor,
} from './message-archive.repository';
import { messagingError } from './messaging.errors';

const GROUP_PAGE_SIZE = 100;
const ROW_PAGE_SIZE = 5000;

// One object per conversation and month, kept for the life of the store: the store purge deletes
// everything under stores/<id>/ (D39).
export const messageArchiveKey = (storeId: string, { conversationId, month }: ArchiveGroup) =>
  `stores/${storeId}/archive/messages/${month}/${conversationId}.jsonl.gz`;

@Injectable()
export class MessageArchiveService {
  constructor(
    @Inject(MessageArchiveRepository) private readonly repository: MessageArchiveRepository,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // Messages go to R2 first and are deleted only after the stored object is checked, so a crash
  // leaves them in place and the rerun writes the same object again. The delete takes a whole
  // conversation month at once, so no rerun sees a part of one.
  async archiveExpired(storeId: string) {
    for (;;) {
      const groups = await this.repository.expiredGroups(storeId, GROUP_PAGE_SIZE);
      for (const group of groups) {
        const exported = await this.export(storeId, group);
        await this.repository.deleteGroup(storeId, group, exported);
      }
      if (groups.length < GROUP_PAGE_SIZE) return;
    }
  }

  // Rows go through one gzip stream a page at a time, so only compressed bytes pile up.
  private async export(storeId: string, group: ArchiveGroup) {
    const gzip = createGzip();
    const chunks: Buffer[] = [];
    const finished = new Promise<void>((resolve, reject) => {
      gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gzip.on('end', resolve);
      gzip.on('error', reject);
    });
    let rows = 0;
    let cursor: MessagePageCursor | null = null;
    do {
      const page = await this.repository.page(storeId, group, cursor, ROW_PAGE_SIZE);
      if (page.lines.length > 0) gzip.write(`${page.lines.join('\n')}\n`);
      rows += page.lines.length;
      cursor = page.next;
    } while (cursor);
    gzip.end();
    await finished;

    const body = Buffer.concat(chunks);
    const key = messageArchiveKey(storeId, group);
    await this.storage.writeBytes(key, body, 'application/gzip');
    const stored = await this.storage.getObjectMetadata(key);
    if (stored?.sizeBytes !== body.byteLength) throw messagingError('MESSAGE_ARCHIVE_INCOMPLETE');
    return rows;
  }
}
