import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationMessageBurstEvent } from '../automation-entry.service';

@HandlesEvent('message.burst_received', { queue: QUEUES.transactional })
export class StartAutomationOnMessageBurst implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationMessageBurstEvent.parse(data);
    await this.entries.startMatchingMessage(storeId, event);
  }
}
