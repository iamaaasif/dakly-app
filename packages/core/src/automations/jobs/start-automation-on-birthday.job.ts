import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationBirthdayEvent } from '../automation-entry.service';

@HandlesEvent('contact.birthday', { queue: QUEUES.transactional })
export class StartAutomationOnBirthday implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationBirthdayEvent.parse(data);
    await this.entries.startMatching(storeId, event);
  }
}
