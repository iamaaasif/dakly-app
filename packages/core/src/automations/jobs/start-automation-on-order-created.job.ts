import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationOrderCreatedEvent } from '../automation-entry.service';

@HandlesEvent('order.created', { queue: QUEUES.transactional })
export class StartAutomationOnOrderCreated implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationOrderCreatedEvent.parse(data);
    await this.entries.startMatchingOrder(storeId, event);
  }
}
