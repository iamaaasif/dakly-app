import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messageReceivedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AiAgentService } from '../ai-agent.service';

const jobData = messageReceivedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.received', { queue: QUEUES.inbound })
export class ScheduleAiReplyOnMessage implements JobHandler {
  constructor(@Inject(AiAgentService) private readonly agent: AiAgentService) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    await this.agent.schedule(storeId, payload.conversationId, payload.messageId);
  }
}
