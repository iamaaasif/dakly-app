import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { automationConsentEvent } from '../automation-entry.service';
import { AutomationTriggerQueue } from '../automation-trigger-queue.service';

@HandlesEvent('consent.changed', { queue: QUEUES.transactional })
export class StartAutomationOnConsent implements JobHandler {
  constructor(@Inject(AutomationTriggerQueue) private readonly triggers: AutomationTriggerQueue) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationConsentEvent.parse(data);
    await this.triggers.enqueue(storeId, event);
  }
}
