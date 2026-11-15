import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { z } from 'zod';

import { ErrorReporter } from '../../platform/logging/error-reporter';
import { runWithJobContext } from '../../platform/logging/job-context';
import { serializeError } from '../../platform/logging/safe-error';
import { QUEUES } from '../../platform/queue/queues';
import { StaffAlertsService } from '../staff-alerts.service';

const payload = z.strictObject({ auditId: z.uuid() });
@Processor(QUEUES.transactional, { concurrency: 1 })
export class StaffAlertDeliveryJob extends WorkerHost {
  constructor(
    @Inject(StaffAlertsService) private readonly alerts: StaffAlertsService,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
  ) {
    super();
  }
  async process(job: Job) {
    return runWithJobContext(async () => {
      let failed = false;
      try {
        const { auditId } = payload.parse(job.data);
        await this.alerts.deliver(auditId);
        await job.updateProgress(100);
      } catch (error) {
        this.reporter.reportJob(serializeError(error), job.id!);
        new Logger(StaffAlertDeliveryJob.name).error(
          { event: 'security', jobId: job.id },
          'Staff alert delivery job failed',
        );
        failed = true;
      }
      // BullMQ persists failures; only the sanitized reporter receives the original error.
      if (failed) throw new Error('Staff alert delivery job failed');
    }, job.id);
  }
}
