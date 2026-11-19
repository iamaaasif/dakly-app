import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationConsentEvent } from '../automation-entry.service';

@HandlesEvent('consent.changed', { queue: QUEUES.workflow })
export class StartAutomationOnConsent implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    await this.entries.enqueue(automationConsentEvent.parse(data));
  }
}
