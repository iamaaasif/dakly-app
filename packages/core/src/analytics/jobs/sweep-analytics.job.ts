import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsReconciliationService } from '../analytics-reconciliation.service';

export const SWEEP_ANALYTICS = 'sweep-analytics';

// The sweep pages through stores to start each store's own repair.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.sync, name: SWEEP_ANALYTICS })
export class SweepAnalyticsJob implements JobHandler {
  constructor(
    @Inject(AnalyticsReconciliationService) private readonly repair: AnalyticsReconciliationService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.repair.schedule();
  }
}
