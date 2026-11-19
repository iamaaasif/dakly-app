import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationTagEvent } from '../automation-entry.service';

@HandlesEvent('contact.tag_added', { queue: QUEUES.workflow })
export class StartAutomationOnTagAdded implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    await this.entries.enqueue(automationTagEvent.parse(data));
  }
}
