import { InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { StaffHistoryService } from '../staff-history.service';
import { STAFF_AUDIT_EXPORT } from './staff-audit-export.job';

export const STAFF_AUDIT_MAINTENANCE = 'staff-audit-maintenance';

// A scheduled sweep over the global staff audit log, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.bulk, name: STAFF_AUDIT_MAINTENANCE })
export class StaffAuditMaintenanceJob implements JobHandler {
  constructor(
    @Inject(StaffHistoryService) private readonly history: StaffHistoryService,
    @InjectQueue(QUEUES.bulk) private readonly queue: Queue,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    const results = await Promise.allSettled([this.history.maintain(), this.enqueue()]);
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Staff audit maintenance failed');
  }

  private async enqueue() {
    const tasks = await this.history.pending();
    for (const task of tasks)
      await this.queue.add(
        STAFF_AUDIT_EXPORT,
        { exportId: task.id },
        {
          jobId: task.id,
          attempts: 5,
          backoff: { type: 'exponential', delay: 30000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
  }
}
