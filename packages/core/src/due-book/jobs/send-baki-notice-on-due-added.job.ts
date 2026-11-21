import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { dueAddedEventSchema } from '@dakly/contracts/events/due-book';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { BakiNoticesService } from '../baki-notices.service';

const event = dueAddedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('due.added', { queue: QUEUES.transactional })
export class SendBakiNoticeOnDueAdded implements JobHandler {
  constructor(@Inject(BakiNoticesService) private readonly notices: BakiNoticesService) {}

  async handle(data: unknown) {
    const {
      storeId,
      payload: { entryId },
    } = event.parse(data);
    await this.notices.sendForEntry(storeId, entryId);
  }
}
