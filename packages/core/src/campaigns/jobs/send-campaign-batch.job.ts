import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { BillingService } from '../../billing/billing.service';
import { KillSwitchesService } from '../../kill-switches/kill-switches.service';
import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignBatchService } from '../campaign-batch.service';

export const SEND_CAMPAIGN_BATCH = 'send-campaign-batch';

const payload = z.strictObject({ storeId: z.uuid() });

@HandlesJob({ queue: QUEUES.campaign, name: SEND_CAMPAIGN_BATCH })
export class SendCampaignBatchJob implements JobHandler {
  constructor(
    @Inject(CampaignBatchService) private readonly batch: CampaignBatchService,
    @Inject(KillSwitchesService) private readonly switches: KillSwitchesService,
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  async handle(data: unknown) {
    const { storeId } = payload.parse(data);
    const paused = await this.switches.deferIfPaused('campaign_sending', storeId);
    if (paused) return paused;
    const readOnly = await this.billing.deferIfReadOnly(storeId);
    if (readOnly) return readOnly;
    return this.batch.sendStoreBatch(storeId);
  }
}
