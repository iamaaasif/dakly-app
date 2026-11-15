import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { z } from 'zod';

import { ErrorReporter } from '../../platform/logging/error-reporter';
import { runWithJobContext } from '../../platform/logging/job-context';
import { serializeError } from '../../platform/logging/safe-error';
import { QUEUES } from '../../platform/queue/queues';
import { StaffHistoryService } from '../staff-history.service';

const payload = z.strictObject({ exportId: z.uuid() });
@Processor(QUEUES.bulk, { concurrency: 1 })
export class StaffAuditExportJob extends WorkerHost {
  constructor(
    @Inject(StaffHistoryService) private readonly history: StaffHistoryService,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
  ) {
    super();
  }
  async process(job: Job) {
    return runWithJobContext(async () => {
      let failed = false;
      try {
        const { exportId } = payload.parse(job.data);
        await this.history.build(exportId);
        await job.updateProgress(100);
      } catch (error) {
        this.reporter.reportJob(serializeError(error), job.id!);
        new Logger(StaffAuditExportJob.name).error(
          { event: 'security', jobId: job.id },
          'Staff audit export job failed',
        );
        failed = true;
      }
      // BullMQ persists failures; only the sanitized reporter receives the original error.
      if (failed) throw new Error('Staff audit export job failed');
    }, job.id);
  }
}
