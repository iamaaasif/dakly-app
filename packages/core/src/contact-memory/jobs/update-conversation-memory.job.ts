import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactMemoryService } from '../contact-memory.service';

export const UPDATE_CONVERSATION_MEMORY = 'update-conversation-memory';
export const updateConversationMemoryPayload = z.strictObject({
  storeId: z.uuid(),
  conversationId: z.uuid(),
});

@HandlesJob({ queue: QUEUES.bulk, name: UPDATE_CONVERSATION_MEMORY })
export class UpdateConversationMemoryJob implements JobHandler {
  constructor(@Inject(ContactMemoryService) private readonly memory: ContactMemoryService) {}

  async handle(data: unknown, finalAttempt: boolean) {
    const { storeId, conversationId } = updateConversationMemoryPayload.parse(data);
    await this.memory.updateFromConversation(storeId, conversationId, finalAttempt);
  }
}
