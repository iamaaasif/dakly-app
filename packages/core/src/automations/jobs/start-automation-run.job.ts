import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationTriggerEvent } from '../automation-entry.service';

export const START_AUTOMATION_RUN = 'start-automation-run';

@HandlesJob({ queue: QUEUES.transactional, name: START_AUTOMATION_RUN })
export class StartAutomationRunJob implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationTriggerEvent.parse(data);
    await this.entries.startMatching(storeId, event);
  }
}
