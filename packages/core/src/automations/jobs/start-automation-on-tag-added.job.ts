import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { automationTagEvent } from '../automation-entry.service';
import { AutomationTriggerQueue } from '../automation-trigger-queue.service';

@HandlesEvent('contact.tag_added', { queue: QUEUES.transactional })
export class StartAutomationOnTagAdded implements JobHandler {
  constructor(@Inject(AutomationTriggerQueue) private readonly triggers: AutomationTriggerQueue) {}

  async handle(data: unknown) {
    await this.triggers.enqueue(automationTagEvent.parse(data));
  }
}
