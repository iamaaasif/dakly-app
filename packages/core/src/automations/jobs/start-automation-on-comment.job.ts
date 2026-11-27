import { Inject } from '@nestjs/common';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationEntryService, automationCommentEvent } from '../automation-entry.service';

@HandlesEvent('comment.received', { queue: QUEUES.transactional })
export class StartAutomationOnComment implements JobHandler {
  constructor(@Inject(AutomationEntryService) private readonly entries: AutomationEntryService) {}

  async handle(data: unknown) {
    const { storeId, ...event } = automationCommentEvent.parse(data);
    await this.entries.startMatchingComment(storeId, event);
  }
}
