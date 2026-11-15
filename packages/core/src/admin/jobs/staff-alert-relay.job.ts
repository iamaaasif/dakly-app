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
import { StaffAlertsService } from '../staff-alerts.service';
import { STAFF_ALERT_DELIVERY } from './staff-alert-delivery.job';

@Injectable()
export class StaffAlertRelayJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StaffAlertRelayJob.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  constructor(
    @Inject(StaffAlertsService) private readonly alerts: StaffAlertsService,
    @InjectQueue(QUEUES.transactional) private readonly queue: Queue,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => this.poll(), JOB_POLL_INTERVAL_MS);
    this.poll();
  }

  private poll() {
    if (this.active) return;
    this.active = runWithJobContext(() =>
      this.enqueue().catch((error) => {
        this.reporter.reportJob(
          serializeError(error),
          jobLogBindings().jobId ?? 'staff-alert-relay',
        );
        this.logger.error({ event: 'security' }, 'Staff alert relay failed');
      }),
    ).finally(() => {
      this.active = undefined;
    });
  }

  private async enqueue() {
    const tasks = await this.alerts.pending();
    for (const task of tasks) {
      const existing = await this.queue.getJob(task.id);
      if (existing && (await existing.getState()) === 'failed') await existing.remove();
      await this.queue.add(
        STAFF_ALERT_DELIVERY,
        { auditId: task.id },
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

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.active;
  }
}
