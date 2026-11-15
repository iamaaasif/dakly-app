import { InjectQueue } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import { ErrorReporter } from '../../platform/logging/error-reporter';
import { jobLogBindings, runWithJobContext } from '../../platform/logging/job-context';
import { serializeError } from '../../platform/logging/safe-error';
import { QUEUES } from '../../platform/queue/queues';
import { JOB_POLL_INTERVAL_MS } from '../../platform/time';
import { StaffHistoryService } from '../staff-history.service';
import { STAFF_AUDIT_EXPORT } from './staff-audit-export.job';

@Injectable()
export class StaffAuditMaintenanceJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StaffAuditMaintenanceJob.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  constructor(
    @Inject(StaffHistoryService) private readonly history: StaffHistoryService,
    @InjectQueue(QUEUES.bulk) private readonly queue: Queue,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => this.poll(), JOB_POLL_INTERVAL_MS);
    this.poll();
  }

  private poll() {
    if (this.active) return;
    this.active = runWithJobContext(() =>
      this.tick().catch((error) => {
        this.reporter.reportJob(
          serializeError(error),
          jobLogBindings().jobId ?? 'staff-audit-maintenance',
        );
        this.logger.error({ event: 'security' }, 'Staff audit maintenance failed');
      }),
    ).finally(() => {
      this.active = undefined;
    });
  }

  private async tick() {
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

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.active;
  }
}
