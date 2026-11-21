import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactMemoryService } from '../contact-memory.service';

export const UPDATE_CONVERSATION_MEMORY = 'update-conversation-memory';
const payload = z.strictObject({ storeId: z.uuid(), conversationId: z.uuid() });

@HandlesJob({ queue: QUEUES.aiReply, name: UPDATE_CONVERSATION_MEMORY })
export class UpdateConversationMemoryJob implements JobHandler {
  constructor(@Inject(ContactMemoryService) private readonly memory: ContactMemoryService) {}

  async handle(data: unknown) {
    const { storeId, conversationId } = payload.parse(data);
    await this.memory.updateFromConversation(storeId, conversationId);
  }
}
