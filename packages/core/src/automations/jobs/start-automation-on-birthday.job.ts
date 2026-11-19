import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationBirthdayEvent } from '../automation-entry.service';

@HandlesEvent('contact.birthday', { queue: QUEUES.workflow })
export class StartAutomationOnBirthday implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    await this.entries.enqueue(automationBirthdayEvent.parse(data));
  }
}
