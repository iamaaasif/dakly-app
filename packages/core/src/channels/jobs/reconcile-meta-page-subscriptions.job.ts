import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { MetaPageSubscriptionsService } from '../meta-page-subscriptions.service';

export const RECONCILE_META_PAGE_SUBSCRIPTIONS = 'reconcile-meta-page-subscriptions';
// The sweep finds stores with unbacked subscriptions across all stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.sync, name: RECONCILE_META_PAGE_SUBSCRIPTIONS })
export class ReconcileMetaPageSubscriptionsJob implements JobHandler {
  constructor(
    @Inject(MetaPageSubscriptionsService)
    private readonly subscriptions: MetaPageSubscriptionsService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.subscriptions.reconcileAll();
  }
}
