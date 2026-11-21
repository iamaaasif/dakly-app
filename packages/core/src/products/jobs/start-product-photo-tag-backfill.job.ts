import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ProductPhotoTagBackfillService } from '../product-photo-tag-backfill.service';

export const START_PRODUCT_PHOTO_TAG_BACKFILL = 'start-product-photo-tag-backfill';
// Runs once for every store, so the payload has no store.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: START_PRODUCT_PHOTO_TAG_BACKFILL })
export class StartProductPhotoTagBackfillJob implements JobHandler {
  constructor(
    @Inject(ProductPhotoTagBackfillService)
    private readonly backfill: ProductPhotoTagBackfillService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.backfill.startAllStores();
  }
}
