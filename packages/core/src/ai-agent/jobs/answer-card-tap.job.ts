import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messagePostbackReceivedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AiAgentService } from '../ai-agent.service';

const jobData = messagePostbackReceivedEventSchema.extend({ id: z.uuid() });

// The event id is the operation key, so a tap Meta delivers twice is answered once.
@HandlesEvent('message.postback_received', { queue: QUEUES.inbound })
export class AnswerCardTap implements JobHandler {
  constructor(@Inject(AiAgentService) private readonly agent: AiAgentService) {}

  async handle(data: unknown) {
    const { id, storeId, payload } = jobData.parse(data);
    await this.agent.answerCardTap(storeId, payload.conversationId, id, payload.postback);
  }
}
