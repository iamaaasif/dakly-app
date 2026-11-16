import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { notificationCreatedEventSchema } from '@dakly/contracts/events/notifications';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { NotificationStreamService } from '../notification-stream.service';

// A repeat run announces the row again; each open stream sends a row id once.
@HandlesEvent('notification.created', { queue: QUEUES.transactional })
export class StreamNotificationOnCreated implements JobHandler {
  constructor(
    @Inject(NotificationStreamService) private readonly stream: NotificationStreamService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = notificationCreatedEventSchema
      .extend({ id: z.uuid() })
      .parse(data);
    await this.stream.announce(storeId, payload.notificationId, payload.userId);
  }
}
