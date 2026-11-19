import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { MetaWebhooksService } from '../meta-webhooks.service';

export const PURGE_WEBHOOK_EVENTS = 'purge-webhook-events';

// Webhook deliveries are global because one delivery can cover several stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: PURGE_WEBHOOK_EVENTS })
export class PurgeWebhookEventsJob implements JobHandler {
  constructor(@Inject(MetaWebhooksService) private readonly webhooks: MetaWebhooksService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.webhooks.purgeDeliveries();
  }
}
