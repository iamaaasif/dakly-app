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

  async handle(data: unknown, finalAttempt: boolean) {
    const { storeId, conversationId, messageId } = payload.parse(data);
    try {
      return await this.agent.reply(storeId, conversationId, messageId);
    } catch (error) {
      if (finalAttempt) await this.handOverFailedReply(storeId, conversationId, messageId);
      throw error;
    }
  }

  // The job still fails with its own error, which is the one worth reporting, so a hand-over
  // that fails too is not allowed to replace it.
  private async handOverFailedReply(storeId: string, conversationId: string, messageId: string) {
    try {
      await this.agent.handOverAfterFailure(storeId, conversationId, messageId);
    } catch {
      // Left for the job's own failure report.
    }
  }
}
