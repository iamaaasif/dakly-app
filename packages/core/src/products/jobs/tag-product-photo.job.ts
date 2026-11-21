import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { productPhotoAddedEventSchema } from '@dakly/contracts/events/products';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ProductPhotoTagsService } from '../product-photo-tags.service';
import { productError } from '../products.errors';

const jobData = productPhotoAddedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('product.photo_added', { queue: QUEUES.inbound, retryBackoffMs: 30_000 })
export class TagProductPhotoJob implements JobHandler {
  constructor(@Inject(ProductPhotoTagsService) private readonly tags: ProductPhotoTagsService) {}

  async handle(data: unknown, finalAttempt: boolean) {
    const { storeId, payload } = jobData.parse(data);
    const result = await this.tags.tag(storeId, payload.fileId);
    // The last attempt gives up and leaves the photo untagged; it is still a normal photo.
    if (result === 'retry' && !finalAttempt)
      throw productError('PRODUCT_PHOTO_TAGGING_UNAVAILABLE');
  }
}
