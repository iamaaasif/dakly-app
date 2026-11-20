import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { CampaignCountsService } from './campaign-counts.service';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

const ACTOR = { kind: 'system' } as const;

@Injectable()
export class CampaignCompletionService {
  constructor(
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(CampaignsService) private readonly service: CampaignsService,
    @Inject(CampaignCountsService) private readonly counts: CampaignCountsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async finish(storeId: string, id: string, processed: boolean) {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign?.approvedAt) return;
      const now = this.clock.now();
      if (!canSettle(campaign)) {
        if (processed) await this.counts.refresh(storeId, id, 'batch');
        return;
      }
      const cancelledAt = campaign.status === 'cancelled' ? now : undefined;
      const settled = await this.service.settleReservation(
        storeId,
        { id, approvedAt: campaign.approvedAt, cancelledAt },
        ACTOR,
      );
      if (!settled || cancelledAt) {
        await this.counts.refresh(storeId, id, cancelledAt ? 'force' : 'batch');
        return;
      }
      await this.campaigns.changeStatus(
        storeId,
        id,
        { status: 'sending' },
        { status: 'sent', finishedAt: now, updatedAt: now },
      );
      await this.counts.refresh(storeId, id, 'force');
      await this.outbox.publish({
        type: 'campaign.sent',
        storeId,
        occurredAt: now.toISOString(),
        payload: { campaignId: id },
      });
    });
  }
}

function canSettle(campaign: LockedCampaign): boolean {
  return (
    (campaign.status === 'sending' && campaign.shortLinkBase !== null) ||
    (campaign.status === 'cancelled' && campaign.settlementPendingAt !== null)
  );
}

export function canProcess(
  campaign: LockedCampaign | undefined,
): campaign is LockedCampaign & { shortLinkBase: string } {
  return !!campaign?.shortLinkBase && canSettle(campaign);
}
