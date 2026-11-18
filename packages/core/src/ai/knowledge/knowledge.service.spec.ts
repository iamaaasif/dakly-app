import type { LazyModuleLoader } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { StoreTransaction } from '../../platform/database/store-transaction';
import type { OutboxService } from '../../platform/outbox/outbox.service';
import type { AiService } from '../ai.service';
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

  it('searches the store with an embedding of the same query', async () => {
    const { service } = fixture();
    await expect(service.search(storeId, 'ঢাকা', 1)).resolves.toEqual([
      { itemId, content: 'ঢাকায় ডেলিভারি ৬০ টাকা।' },
    ]);
  });

  it('explains a failed item in the shop response', async () => {
    const { service } = fixture();
    await expect(service.view(storeId, itemId)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'Dakly could not index this item. Edit it to retry.',
    });
