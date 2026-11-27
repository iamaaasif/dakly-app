import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { conversationHandedOverEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SuggestedReplyService } from '../suggested-reply.service';

const jobData = conversationHandedOverEventSchema.extend({ id: z.uuid() });

// A repeat run writes the draft again, and only while nobody has written since the hand-over.
@HandlesEvent('conversation.handed_over', { queue: QUEUES.aiReply })
export class DraftSuggestedReply implements JobHandler {
  constructor(@Inject(SuggestedReplyService) private readonly suggestions: SuggestedReplyService) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    await this.suggestions.draft(storeId, payload.conversationId, payload.reason);
  }
}
