import { describe, expect, it } from 'vitest';

import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { StoreTransaction } from '../../platform/database/store-transaction';
import type { OutboxService } from '../../platform/outbox/outbox.service';
import type { KnowledgeItem, KnowledgeRepository } from './knowledge.repository';
import { KnowledgeService } from './knowledge.service';

const storeId = 'dffb765b-69e5-46fc-8adc-886147a476ec';
const itemId = '8aa450d6-bf5b-4aef-945b-2777caff81e9';
const userId = '5a8a9833-9c06-4bcb-9ad8-51b1a16258e1';
const actor = { kind: 'user', userId } as const;
const now = new Date('2026-11-18T16:00:00Z');

describe('KnowledgeService', () => {
  it('returns a processing item and schedules indexing with no shop text in the event', async () => {
    const { service, events } = fixture();

    await expect(
      service.create(storeId, actor, { kind: 'policy', answer: 'ঢাকায় ৬০ টাকা।' }),
    ).resolves.toMatchObject({ id: itemId, status: 'processing', answer: 'ঢাকায় ৬০ টাকা।' });
    expect(events).toEqual([
      {
        type: 'knowledge.index_requested',
        storeId,
        occurredAt: now.toISOString(),
        payload: { knowledgeItemId: itemId },
      },
    ]);
  });

  it('issues a signed upload for a new tenant-owned pending file', async () => {
    const { service, files } = fixture();
    const result = await service.requestUpload(storeId, actor, {
      contentType: 'application/pdf',
      sizeBytes: 500,
    });
    const key = `stores/${storeId}/knowledge/${result.fileId}`;
    expect(result.uploadUrl).toBe(`https://files.test/${key}`);
    expect(files).toEqual([
      {
        id: result.fileId,
        objectKey: key,
        contentType: 'application/pdf',
        sizeBytes: 500,
        uploadedByUserId: userId,
        createdAt: now,
      },
    ]);
  });

  it('explains a failed item in the shop response', async () => {
    const { service } = fixture();
    await expect(service.view(storeId, itemId)).resolves.toMatchObject({
      status: 'failed',
      failureReason:
        'Dakly could not prepare this item for AI answers. Check the text or choose another file and save again.',
    });
  });

  it('rejects a missing knowledge file before creating an item', async () => {
    const { service, events } = fixture();

    await expect(
      service.create(storeId, actor, { kind: 'file', fileId: itemId }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_FILE_NOT_FOUND' });
    expect(events).toEqual([]);
  });
});

function fixture() {
  const events: DaklyEvent[] = [];
  const files: object[] = [];
  const repository = {
    async create(
      _storeId: string,
      _userId: string,
      input: { answer: string },
    ): Promise<KnowledgeItem> {
      return {
        id: itemId,
        kind: 'policy',
        answer: input.answer,
        fileId: null,
        status: 'processing',
        factsCount: 0,
        createdAt: now,
        updatedAt: now,
      };
    },
    async createFile(_storeId: string, file: object) {
      files.push(file);
    },
    async find(): Promise<KnowledgeItem> {
      return {
        id: itemId,
        kind: 'policy',
        answer: 'ঢাকায় ৬০ টাকা।',
        fileId: null,
        status: 'failed',
        factsCount: 0,
        createdAt: now,
        updatedAt: now,
      };
    },
    async findFile() {
      return undefined;
    },
  } as KnowledgeRepository;
  const outbox = {
    async publish(event: DaklyEvent) {
      events.push(event);
    },
  } as OutboxService;
  const transaction = {
    run: <T>(_storeId: string, work: () => Promise<T>) => work(),
  } as StoreTransaction;
  const service = new KnowledgeService(repository, outbox, transaction, { now: () => now }, {
    createUploadUrl: (key: string) => `https://files.test/${key}`,
  } as FileStorageDriver);
  return { service, events, files };
}
