import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { AiService } from '../ai/ai.service';
import { QUEUES } from '../platform/queue/queues';
import { ProductSearchSourceService } from '../products/product-search-source.service';
import { StoresService } from '../stores/stores.service';
import { ProductSearchIndexService } from './product-search-index.service';

export const BACKFILL_PRODUCT_SEARCH_EMBEDDINGS = 'backfill-product-search-embeddings';
const STORE_PAGE_SIZE = 100;
export const BACKFILL_BATCH_SIZE = 20;
// The pause between batches keeps a large catalogue from crowding the model for other shops.
export const BACKFILL_BATCH_DELAY_MS = 5_000;

@Injectable()
export class ProductSearchBackfillService {
  constructor(
    @Inject(ProductSearchSourceService) private readonly products: ProductSearchSourceService,
    @Inject(ProductSearchIndexService) private readonly indexer: ProductSearchIndexService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(StoresService) private readonly stores: StoresService,
    @InjectQueue(QUEUES.bulk) private readonly bulk: Queue,
  ) {}

  async startAllStores() {
    let after: string | null = null;
    for (;;) {
      const storeIds = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      for (const storeId of storeIds) await this.enqueue(storeId, null, 0);
      if (storeIds.length < STORE_PAGE_SIZE) return;
      after = storeIds.at(-1) ?? null;
    }
  }

  // Safe to run twice: only products with no embedding or an old model are picked, and the cursor
  // only moves forward. An embed failure fails the batch so the queue retries from the same cursor.
  async runBatch(storeId: string, after: string | null) {
    const productIds = await this.products.staleSearchProductIds(storeId, {
      after,
      model: this.ai.embeddingModel,
      limit: BACKFILL_BATCH_SIZE,
    });
    for (const productId of productIds)
      await this.indexer.index(storeId, productId, { rebuild: true });
    const last = productIds.at(-1);
    if (productIds.length === BACKFILL_BATCH_SIZE && last)
      await this.enqueue(storeId, last, BACKFILL_BATCH_DELAY_MS);
  }

  private async enqueue(storeId: string, after: string | null, delay: number) {
    await this.bulk.add(
      BACKFILL_PRODUCT_SEARCH_EMBEDDINGS,
      { storeId, after },
      {
        jobId: `${BACKFILL_PRODUCT_SEARCH_EMBEDDINGS}-${storeId}-${after ?? 'start'}`,
        delay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
