import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  AutomationEntryService,
  START_AUTOMATION_RUN,
  startAutomationRunPayload,
} from '../automation-entry.service';

@HandlesJob({ queue: QUEUES.workflow, name: START_AUTOMATION_RUN })
export class StartAutomationRunJob implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { automationId, ...event } = startAutomationRunPayload.parse(data);
    await this.entries.start(automationId, event);
  }
}
