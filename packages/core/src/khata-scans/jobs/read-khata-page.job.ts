import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { khataPageQueuedEventSchema } from '@dakly/contracts/events/khata-scans';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { KhataScansService } from '../khata-scans.service';

// A page that is already read is left alone, and a rerun after a crash is not charged twice.
@HandlesEvent('khata_page.queued', { queue: QUEUES.bulk })
export class ReadKhataPage implements JobHandler {
  constructor(@Inject(KhataScansService) private readonly khataScans: KhataScansService) {}

  async handle(data: unknown) {
    const { storeId, payload } = khataPageQueuedEventSchema.extend({ id: z.uuid() }).parse(data);
    await this.khataScans.readPage(storeId, payload.pageId);
  }
}
