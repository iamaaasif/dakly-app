import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  AutomationEntryService,
  automationOrderCodCollectedEvent,
} from '../automation-entry.service';

@HandlesEvent('order.cod_collected', { queue: QUEUES.transactional })
export class StartAutomationOnOrderCodCollected implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationOrderCodCollectedEvent.parse(data);
    await this.entries.startMatchingOrder(storeId, event);
  }
}
