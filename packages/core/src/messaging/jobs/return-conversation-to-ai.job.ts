import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { InboxService } from '../inbox.service';

export const RETURN_CONVERSATION_TO_AI = 'return-conversation-to-ai';
const payload = z.strictObject({ storeId: z.uuid(), conversationId: z.uuid() });

@HandlesJob({ queue: QUEUES.sync, name: RETURN_CONVERSATION_TO_AI })
export class ReturnConversationToAiJob implements JobHandler {
  constructor(@Inject(InboxService) private readonly inbox: InboxService) {}

  async handle(data: unknown) {
    const { storeId, conversationId } = payload.parse(data);
    await this.inbox.returnDue(storeId, conversationId, { kind: 'system' });
  }
}
