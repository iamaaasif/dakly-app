import { describe, expect, it } from 'vitest';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ErasedContactFilesService } from './erased-contact-files.service';

const store = 'store-1';

function service(archive: string[]) {
  const deleted: string[] = [];
  const pages = [archive.slice(0, 1), archive.slice(1)];
  const storage = {
    deleteObject: async (key: string) => void deleted.push(key),
    listObjects: async (_prefix: string, token?: string) => {
      const index = token ? 1 : 0;
      return {
        objects: pages[index]!.map((key) => ({ key, lastModified: new Date() })),
        nextToken: index === 0 ? 'next' : null,
      };
    },
  } as unknown as FileStorageDriver;
  return { instance: new ErasedContactFilesService(storage), deleted };
}

describe('ErasedContactFilesService', () => {
  it('deletes attachments and only the erased chats archives, across list pages', async () => {
    const { instance, deleted } = service([
      `stores/${store}/archive/messages/2026-01/chat-a.jsonl.gz`,
      `stores/${store}/archive/messages/2026-01/chat-b.jsonl.gz`,
      `stores/${store}/archive/messages/2026-02/chat-a.jsonl.gz`,
    ]);
    await instance.deleteFiles(store, ['chat-a'], [`stores/${store}/files/photo.jpg`]);
    expect(deleted).toEqual([
      `stores/${store}/files/photo.jpg`,
      `stores/${store}/archive/messages/2026-01/chat-a.jsonl.gz`,
      `stores/${store}/archive/messages/2026-02/chat-a.jsonl.gz`,
    ]);
  });

  it('never deletes a key outside the store folder', async () => {
    const { instance, deleted } = service([]);
    await instance.deleteFiles(store, [], ['stores/other-store/files/photo.jpg', 'x.jpg']);
    expect(deleted).toEqual([]);
  });
});
