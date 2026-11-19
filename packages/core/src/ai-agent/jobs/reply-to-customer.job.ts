import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AiAgentService, REPLY_TO_CUSTOMER } from '../ai-agent.service';

const payload = z.strictObject({
  storeId: z.uuid(),
  conversationId: z.uuid(),
  messageId: z.uuid(),
});

@HandlesJob({ queue: QUEUES.aiReply, name: REPLY_TO_CUSTOMER })
export class ReplyToCustomerJob implements JobHandler {
  constructor(@Inject(AiAgentService) private readonly agent: AiAgentService) {}

  handle(data: unknown) {
    const { storeId, conversationId, messageId } = payload.parse(data);
    return this.agent.reply(storeId, conversationId, messageId);
  }
}
