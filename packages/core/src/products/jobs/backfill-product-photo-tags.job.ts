import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  BACKFILL_PRODUCT_PHOTO_TAGS,
  ProductPhotoTagBackfillService,
} from '../product-photo-tag-backfill.service';

const payload = z.strictObject({ storeId: z.uuid(), after: z.uuid().nullable() });

@HandlesJob({ queue: QUEUES.bulk, name: BACKFILL_PRODUCT_PHOTO_TAGS })
export class BackfillProductPhotoTagsJob implements JobHandler {
  constructor(
    @Inject(ProductPhotoTagBackfillService)
    private readonly backfill: ProductPhotoTagBackfillService,
  ) {}

  async handle(data: unknown) {
    const { storeId, after } = payload.parse(data);
    await this.backfill.runBatch(storeId, after);
  }
}
