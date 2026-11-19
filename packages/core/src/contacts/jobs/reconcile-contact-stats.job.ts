import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactStatsService } from '../contact-stats.service';

export const RECONCILE_CONTACT_STATS = 'reconcile-contact-stats';

const payload = z.strictObject({ storeId: z.uuid() });

@HandlesJob({ queue: QUEUES.bulk, name: RECONCILE_CONTACT_STATS })
export class ReconcileContactStatsJob implements JobHandler {
  constructor(@Inject(ContactStatsService) private readonly stats: ContactStatsService) {}

  async handle(data: unknown) {
    const { storeId } = payload.parse(data);
    await this.stats.reconcile(storeId);
  }
}
