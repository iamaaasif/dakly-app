import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { commentReceivedEventSchema } from '@dakly/contracts/events/social';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CommentAutoReplyService } from '../comment-auto-reply.service';

const event = commentReceivedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('comment.received', { queue: QUEUES.aiReply })
export class ReplyToFacebookCommentJob implements JobHandler {
  constructor(
    @Inject(CommentAutoReplyService) private readonly comments: CommentAutoReplyService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.comments.reply(storeId, payload.commentId);
  }
}
