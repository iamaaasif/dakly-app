import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationMessageIntentEvent } from '../automation-entry.service';

@HandlesEvent('message.intent_classified', { queue: QUEUES.transactional })
export class StartAutomationOnMessageIntent implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationMessageIntentEvent.parse(data);
    await this.entries.startMatchingMessage(storeId, event);
  }
}
