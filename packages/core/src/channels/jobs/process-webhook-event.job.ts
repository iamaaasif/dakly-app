import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { MetaWebhookRoutingService } from '../meta-webhook-routing.service';

export const PROCESS_WEBHOOK_EVENT = 'process-webhook-event';

// The delivery can contain events for several stores, so the worker resolves each account.
const payload = z.strictObject({ webhookEventId: z.uuid() });

@HandlesJob({ queue: QUEUES.inbound, name: PROCESS_WEBHOOK_EVENT })
export class ProcessWebhookEventJob implements JobHandler {
  constructor(
    @Inject(MetaWebhookRoutingService) private readonly routing: MetaWebhookRoutingService,
  ) {}

  async handle(data: unknown, finalAttempt: boolean) {
    const { webhookEventId } = payload.parse(data);
    await this.routing.process(webhookEventId, finalAttempt);
  }
}
