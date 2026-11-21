import { describe, expect, it } from 'vitest';

import type { StoresService } from '../stores/stores.service';
import {
  BACKFILL_BATCH_DELAY_MS,
  BACKFILL_BATCH_SIZE,
  ProductPhotoTagBackfillService,
} from './product-photo-tag-backfill.service';
import type { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import type { ProductPhotoTagsService, TagResult } from './product-photo-tags.service';

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
const fileIds = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `019c01ea-0000-7000-8000-${String(index).padStart(12, '0')}`,
  );

function setup(photos: string[], results: Record<string, TagResult> = {}) {
  const tagged: string[] = [];
  const queued: { data: unknown; delay: number }[] = [];
  const service = new ProductPhotoTagBackfillService(
    { untaggedPhotoIds: async () => photos } as unknown as ProductPhotoTagsRepository,
    {
      tag: async (_store: string, fileId: string) => {
        tagged.push(fileId);
        return results[fileId] ?? 'tagged';
      },
    } as unknown as ProductPhotoTagsService,
    {} as StoresService,
    {
      add: async (_name: string, data: unknown, options: { delay: number }) =>
        void queued.push({ data, delay: options.delay }),
    } as never,
  );
  return { service, tagged, queued };
}

describe('product photo tag backfill', () => {
  it('tags a short batch and stops', async () => {
    const photos = fileIds(3);
    const { service, tagged, queued } = setup(photos);
    await service.runBatch(storeId, null);
    expect(tagged).toEqual(photos);
    expect(queued).toEqual([]);
  });

  it('continues after the last photo of a full batch, after a pause', async () => {
    const photos = fileIds(BACKFILL_BATCH_SIZE);
    const { service, queued } = setup(photos);
    await service.runBatch(storeId, null);
    expect(queued).toEqual([
      { data: { storeId, after: photos.at(-1) }, delay: BACKFILL_BATCH_DELAY_MS },
    ]);
  });

  it('fails the batch when the model is unavailable so the queue retries it', async () => {
    const photos = fileIds(2);
    const { service, queued } = setup(photos, { [photos[0]!]: 'retry' });
    await expect(service.runBatch(storeId, null)).rejects.toMatchObject({
      code: 'PRODUCT_PHOTO_TAGGING_UNAVAILABLE',
    });
    expect(queued).toEqual([]);
  });
});
