import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { productUpdatedEventSchema } from '@dakly/contracts/events/products';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ProductSearchIndexService } from '../product-search-index.service';

const jobData = productUpdatedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('product.updated', { queue: QUEUES.bulk, retryBackoffMs: 60_000 })
export class IndexProductSearchOnProductUpdated implements JobHandler {
  constructor(
    @Inject(ProductSearchIndexService) private readonly indexer: ProductSearchIndexService,
  ) {}

  async handle(data: unknown): Promise<void> {
    const { storeId, payload } = jobData.parse(data);
    await this.indexer.index(storeId, payload.productId);
  }
}
