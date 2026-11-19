import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { automationBirthdayEvent } from '../automation-entry.service';
import { AutomationTriggerQueue } from '../automation-trigger-queue.service';

@HandlesEvent('contact.birthday', { queue: QUEUES.transactional })
export class StartAutomationOnBirthday implements JobHandler {
  constructor(@Inject(AutomationTriggerQueue) private readonly triggers: AutomationTriggerQueue) {}

  async handle(data: unknown) {
    await this.triggers.enqueue(automationBirthdayEvent.parse(data));
  }
}
