import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationOrderStageEvent } from '../automation-entry.service';

@HandlesEvent('order.stage_changed', { queue: QUEUES.transactional })
export class StartAutomationOnOrderStageChanged implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationOrderStageEvent.parse(data);
    await this.entries.startMatchingOrder(storeId, event);
  }
}
