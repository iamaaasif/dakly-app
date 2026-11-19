import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messageTappedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignCountsService } from '../campaign-counts.service';

const payload = messageTappedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.tapped', { queue: QUEUES.campaign })
export class RecordCampaignTapJob implements JobHandler {
  constructor(@Inject(CampaignCountsService) private readonly counts: CampaignCountsService) {}

  async handle(data: unknown): Promise<void> {
    const { storeId, occurredAt, payload: tap } = payload.parse(data);
    if (tap.sourceType !== 'campaign' || !tap.sourceId || !tap.contactId) return;
    await this.counts.recordTap(storeId, {
      campaignId: tap.sourceId,
      contactId: tap.contactId,
      at: new Date(occurredAt),
    });
  }
}
