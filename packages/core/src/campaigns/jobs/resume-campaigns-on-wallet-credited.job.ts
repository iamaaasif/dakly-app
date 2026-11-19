import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { walletCreditedEventSchema } from '@dakly/contracts/events/wallets';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignFundingService } from '../campaign-funding.service';

const payloadSchema = walletCreditedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('wallet.credited', { queue: QUEUES.campaign })
export class ResumeCampaignsOnWalletCredited implements JobHandler {
  constructor(@Inject(CampaignFundingService) private readonly funding: CampaignFundingService) {}

  async handle(data: unknown) {
    const { storeId, payload } = payloadSchema.parse(data);
    if (payload.wallet === 'sms_credits')
      await this.funding.resumeAfterTopUp(storeId, payload.entryId);
  }
}
