import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  ContactStatsSweepService,
  RECONCILE_CONTACT_STATS,
  reconcileContactStatsPayload,
} from '../contact-stats-sweep.service';

export { RECONCILE_CONTACT_STATS };

@HandlesJob({ queue: QUEUES.bulk, name: RECONCILE_CONTACT_STATS })
export class ReconcileContactStatsJob implements JobHandler {
  constructor(@Inject(ContactStatsSweepService) private readonly stats: ContactStatsSweepService) {}

  async handle(data: unknown) {
    await this.stats.reconcile(reconcileContactStatsPayload.parse(data));
  }
}
