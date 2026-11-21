import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  BACKFILL_PRODUCT_SEARCH_EMBEDDINGS,
  ProductSearchBackfillService,
} from '../product-search-backfill.service';

const payload = z.strictObject({ storeId: z.uuid(), after: z.uuid().nullable() });

@HandlesJob({ queue: QUEUES.bulk, name: BACKFILL_PRODUCT_SEARCH_EMBEDDINGS })
export class BackfillProductSearchEmbeddingsJob implements JobHandler {
  constructor(
    @Inject(ProductSearchBackfillService) private readonly backfill: ProductSearchBackfillService,
  ) {}

  async handle(data: unknown) {
    const { storeId, after } = payload.parse(data);
    await this.backfill.runBatch(storeId, after);
  }
}
