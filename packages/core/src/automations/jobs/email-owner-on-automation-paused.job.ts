import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { automationPausedEventSchema } from '@dakly/contracts/events/automations';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationsService } from '../automations.service';

// The in-app card was written with the pause; the email waits for the commit, with no
// transaction open. A workflow already resumed gets no email, and a rerun emails each owner once.
@HandlesEvent('automation.paused', { queue: QUEUES.transactional })
export class EmailOwnerOnAutomationPaused implements JobHandler {
  constructor(@Inject(AutomationsService) private readonly automations: AutomationsService) {}

  async handle(data: unknown) {
    const { id, storeId, payload } = automationPausedEventSchema
      .extend({ id: z.uuid() })
      .parse(data);
    await this.automations.emailBalancePause(storeId, payload.automationId, id);
  }
}
