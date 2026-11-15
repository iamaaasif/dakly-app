import { InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { StaffAlertsService } from '../staff-alerts.service';
import { STAFF_ALERT_DELIVERY } from './staff-alert-delivery.job';

export const STAFF_ALERT_RELAY = 'staff-alert-relay';

// A scheduled sweep over global staff alerts, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.transactional, name: STAFF_ALERT_RELAY })
export class StaffAlertRelayJob implements JobHandler {
  constructor(
    @Inject(StaffAlertsService) private readonly alerts: StaffAlertsService,
    @InjectQueue(QUEUES.transactional) private readonly queue: Queue,
  ) {}

  // Deduplication by audit id drops an alert already queued or retrying. Unlike a job id, it ends
  // when the job fails, so a failed delivery kept for inspection never blocks the next attempt.
  async handle(data: unknown) {
    payload.parse(data);
    const tasks = await this.alerts.pending();
    await this.queue.addBulk(
      tasks.map((task) => ({
        name: STAFF_ALERT_DELIVERY,
        data: { auditId: task.id },
        opts: {
          deduplication: { id: task.id },
          attempts: 5,
          backoff: { type: 'exponential', delay: 30000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      })),
    );
  }
}
