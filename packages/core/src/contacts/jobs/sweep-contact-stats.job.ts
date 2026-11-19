import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactStatsSweepService } from '../contact-stats-sweep.service';

export const SWEEP_CONTACT_STATS = 'sweep-contact-stats';

// The scheduler sweep has no store. It queues that day's repair for each store.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: SWEEP_CONTACT_STATS })
export class SweepContactStatsJob implements JobHandler {
  constructor(@Inject(ContactStatsSweepService) private readonly stats: ContactStatsSweepService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.stats.scheduleReconciliation();
  }
}
