import { describe, expect, it } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { ProductSearchSourceService } from '../products/product-search-source.service';
import type { StoresService } from '../stores/stores.service';
import {
  BACKFILL_BATCH_DELAY_MS,
  BACKFILL_BATCH_SIZE,
  ProductSearchBackfillService,
} from './product-search-backfill.service';
import type { ProductSearchIndexService } from './product-search-index.service';

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
const productIds = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `019c01ea-0000-7000-8000-${String(index).padStart(12, '0')}`,
  );

function setup(stale: string[], failOn?: string) {
  const indexed: { productId: string; rebuild: boolean | undefined }[] = [];
  const queued: { data: unknown; delay: number }[] = [];
  const lookups: { after: string | null; model: string }[] = [];
  const service = new ProductSearchBackfillService(
    {
      staleSearchProductIds: async (
        _store: string,
        input: { after: string | null; model: string },
      ) => {
        lookups.push(input);
        return stale;
      },
    } as unknown as ProductSearchSourceService,
    {
      index: async (_store: string, productId: string, options: { rebuild?: boolean }) => {
        if (productId === failOn) throw new Error('embed unavailable');
        indexed.push({ productId, rebuild: options.rebuild });
      },
    } as unknown as ProductSearchIndexService,
    { embeddingModel: 'embed-v2' } as AiService,
    {} as StoresService,
    {
      add: async (_name: string, data: unknown, options: { delay: number }) =>
        void queued.push({ data, delay: options.delay }),
    } as never,
  );
  return { service, indexed, queued, lookups };
}

describe('product search embedding backfill', () => {
  it('rebuilds a short batch against the configured model and stops', async () => {
    const stale = productIds(3);
    const { service, indexed, queued, lookups } = setup(stale);
    await service.runBatch(storeId, null);
    expect(indexed).toEqual(stale.map((productId) => ({ productId, rebuild: true })));
    expect(lookups).toEqual([{ after: null, model: 'embed-v2', limit: BACKFILL_BATCH_SIZE }]);
    expect(queued).toEqual([]);
  });

  it('continues after the last product of a full batch, after a pause', async () => {
    const stale = productIds(BACKFILL_BATCH_SIZE);
    const { service, queued } = setup(stale);
    await service.runBatch(storeId, null);
    expect(queued).toEqual([
      { data: { storeId, after: stale.at(-1) }, delay: BACKFILL_BATCH_DELAY_MS },
    ]);
  });

  it('fails the batch when an embed fails so the queue retries it from the same cursor', async () => {
    const stale = productIds(BACKFILL_BATCH_SIZE);
    const { service, queued } = setup(stale, stale[1]);
    await expect(service.runBatch(storeId, null)).rejects.toThrow('embed unavailable');
    expect(queued).toEqual([]);
  });
});
