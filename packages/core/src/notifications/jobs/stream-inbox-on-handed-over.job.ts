import { Inject } from '@nestjs/common';

import { conversationHandedOverEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { NotificationStreamService } from '../notification-stream.service';

// Only a signal goes out; each open inbox reads the list again. A repeat run is harmless.
@HandlesEvent('conversation.handed_over', { queue: QUEUES.transactional })
export class StreamInboxOnHandedOver implements JobHandler {
  constructor(
    @Inject(NotificationStreamService) private readonly stream: NotificationStreamService,
  ) {}

  async handle(data: unknown) {
    const { storeId } = conversationHandedOverEventSchema.pick({ storeId: true }).parse(data);
    await this.stream.announceInbox(storeId);
  }
}
