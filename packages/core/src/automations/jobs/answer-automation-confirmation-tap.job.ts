import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messagePostbackReceivedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationConfirmationTapService } from '../automation-confirmation-tap.service';

const jobData = messagePostbackReceivedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.postback_received', { queue: QUEUES.inbound })
export class AnswerAutomationConfirmationTap implements JobHandler {
  constructor(
    @Inject(AutomationConfirmationTapService)
    private readonly taps: AutomationConfirmationTapService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    const { channel, identityId, tapKey } = payload;
    if (channel === 'messenger' && identityId && tapKey)
      await this.taps.answer(storeId, { ...payload, identityId, tapKey });
  }
}
