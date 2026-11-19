import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { RETURN_CONVERSATION_TO_AI } from '../conversation-returns.service';
import { InboxService } from '../inbox.service';

const payload = z.strictObject({ storeId: z.uuid(), conversationId: z.uuid() });

@HandlesJob({ queue: QUEUES.sync, name: RETURN_CONVERSATION_TO_AI })
export class ReturnConversationToAiJob implements JobHandler {
  constructor(@Inject(InboxService) private readonly inbox: InboxService) {}

  async handle(data: unknown) {
    const { storeId, conversationId } = payload.parse(data);
    await this.inbox.returnDue(storeId, conversationId, { kind: 'system' });
  }
}
