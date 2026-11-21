import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { QUEUES } from '../platform/queue/queues';
import { StoresService } from '../stores/stores.service';
import { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import { ProductPhotoTagsService } from './product-photo-tags.service';
import { productError } from './products.errors';

export const BACKFILL_PRODUCT_PHOTO_TAGS = 'backfill-product-photo-tags';
const STORE_PAGE_SIZE = 100;
export const BACKFILL_BATCH_SIZE = 10;
// The pause between batches keeps a large catalogue from crowding the model for other shops.
export const BACKFILL_BATCH_DELAY_MS = 10_000;

@Injectable()
export class ProductPhotoTagBackfillService {
  constructor(
    @Inject(ProductPhotoTagsRepository) private readonly repository: ProductPhotoTagsRepository,
    @Inject(ProductPhotoTagsService) private readonly tags: ProductPhotoTagsService,
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

  // Safe to run twice: tagged photos are skipped, and the cursor only moves forward. A model
  // outage fails the batch so the queue retries it from the same cursor.
  async runBatch(storeId: string, after: string | null) {
    const fileIds = await this.repository.untaggedPhotoIds(storeId, after, BACKFILL_BATCH_SIZE);
    let unavailable = false;
    for (const fileId of fileIds)
      if ((await this.tags.tag(storeId, fileId)) === 'retry') unavailable = true;
    if (unavailable) throw productError('PRODUCT_PHOTO_TAGGING_UNAVAILABLE');
    const last = fileIds.at(-1);
    if (fileIds.length === BACKFILL_BATCH_SIZE && last)
      await this.enqueue(storeId, last, BACKFILL_BATCH_DELAY_MS);
  }

  private async enqueue(storeId: string, after: string | null, delay: number) {
    await this.bulk.add(
      BACKFILL_PRODUCT_PHOTO_TAGS,
      { storeId, after },
      {
        jobId: `${BACKFILL_PRODUCT_PHOTO_TAGS}-${storeId}-${after ?? 'start'}`,
        delay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
