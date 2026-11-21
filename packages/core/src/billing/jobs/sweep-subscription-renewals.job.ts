import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SubscriptionJobsService } from '../subscription-jobs.service';

export const SWEEP_SUBSCRIPTION_RENEWALS = 'sweep-subscription-renewals';

@HandlesJob({ queue: QUEUES.payments, name: SWEEP_SUBSCRIPTION_RENEWALS })
export class SweepSubscriptionRenewalsJob implements JobHandler {
  constructor(@Inject(SubscriptionJobsService) private readonly jobs: SubscriptionJobsService) {}

  // This sweep finds due work across stores.
  async handle() {
    await this.jobs.scheduleRenewals();
  }
}
