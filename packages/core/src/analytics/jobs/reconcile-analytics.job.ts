import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  AnalyticsReconciliationService,
  analyticsReconciliationPayload,
  RECONCILE_ANALYTICS,
} from '../analytics-reconciliation.service';

@HandlesJob({ queue: QUEUES.bulk, name: RECONCILE_ANALYTICS })
export class ReconcileAnalyticsJob implements JobHandler {
  constructor(
    @Inject(AnalyticsReconciliationService) private readonly repair: AnalyticsReconciliationService,
  ) {}

  async handle(data: unknown) {
    await this.repair.reconcile(analyticsReconciliationPayload.parse(data));
  }
}
