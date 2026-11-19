import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { orderStageChangedEventSchema } from '@dakly/contracts/events/orders';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactStatsService } from '../contact-stats.service';

const event = orderStageChangedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('order.stage_changed', { queue: QUEUES.transactional })
export class RefreshContactStatsOnOrderStageChanged implements JobHandler {
  constructor(@Inject(ContactStatsService) private readonly stats: ContactStatsService) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.stats.refreshOrder(storeId, payload.orderId);
  }
}
