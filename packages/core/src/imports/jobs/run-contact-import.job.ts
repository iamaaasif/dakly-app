import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { importStartedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ImportsService } from '../imports.service';

// A finished import is left alone, and a rerun finds the contacts it already added.
@HandlesEvent('import.started', { queue: QUEUES.bulk })
export class RunContactImport implements JobHandler {
  constructor(@Inject(ImportsService) private readonly importsService: ImportsService) {}

  async handle(data: unknown) {
    const { storeId, payload } = importStartedEventSchema.extend({ id: z.uuid() }).parse(data);
    await this.importsService.runCustomerImport(storeId, payload.importId);
  }
}
