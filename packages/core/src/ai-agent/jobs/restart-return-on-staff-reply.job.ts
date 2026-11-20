import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messageSendRequestedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AiAgentService } from '../ai-agent.service';

const jobData = messageSendRequestedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.send_requested', { queue: QUEUES.inbound })
export class RestartReturnOnStaffReply implements JobHandler {
  constructor(@Inject(AiAgentService) private readonly agent: AiAgentService) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    await this.agent.restartReturnAfterStaffReply(storeId, payload.messageId);
  }
}
