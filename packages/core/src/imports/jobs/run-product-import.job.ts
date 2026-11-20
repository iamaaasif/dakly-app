import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { productImportStartedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ProductImportsService } from '../product-imports.service';

// A finished import is left alone, and a rerun resumes after the last committed batch.
@HandlesEvent('product_import.started', { queue: QUEUES.bulk })
export class RunProductImport implements JobHandler {
  constructor(
    @Inject(ProductImportsService) private readonly importsService: ProductImportsService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = productImportStartedEventSchema
      .extend({ id: z.uuid() })
      .parse(data);
    await this.importsService.run(storeId, payload.importId);
  }
}
