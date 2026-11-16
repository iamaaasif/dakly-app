import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { NotificationsService } from '../notifications.service';

export const WAKE_SNOOZED_NOTIFICATIONS = 'wake-snoozed-notifications';

// A scheduled sweep over every store, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.transactional, name: WAKE_SNOOZED_NOTIFICATIONS })
export class WakeSnoozedNotificationsJob implements JobHandler {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.notifications.wakeSnoozed();
  }
}
