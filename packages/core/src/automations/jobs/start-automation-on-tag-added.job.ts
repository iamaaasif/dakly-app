import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationTagEvent } from '../automation-entry.service';

@HandlesEvent('contact.tag_added', { queue: QUEUES.transactional })
export class StartAutomationOnTagAdded implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationTagEvent.parse(data);
    await this.entries.startMatching(storeId, event);
  }
}
