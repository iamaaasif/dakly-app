import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ProductSearchBackfillService } from '../product-search-backfill.service';

export const START_PRODUCT_SEARCH_BACKFILL = 'start-product-search-backfill';
// Runs for every store, so the payload has no store.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: START_PRODUCT_SEARCH_BACKFILL })
export class StartProductSearchBackfillJob implements JobHandler {
  constructor(
    @Inject(ProductSearchBackfillService) private readonly backfill: ProductSearchBackfillService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.backfill.startAllStores();
  }
}
