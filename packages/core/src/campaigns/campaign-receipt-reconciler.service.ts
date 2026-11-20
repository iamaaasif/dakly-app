import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { SmsService } from '../sms/sms.service';
import { CampaignCountsService } from './campaign-counts.service';
import { isFunded } from './campaign-funding.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';

export type ReceiptClaim = {
  kind: 'receipt';
  recipientId: string;
  providerMessageId: string;
  claimedAt: Date;
  dispatchStartedAt: Date;
  channel: LockedCampaign['channel'];
  credits: number | null;
};

export function canProcess(campaign: LockedCampaign): boolean {
  return (
    isFunded(campaign) &&
    (campaign.status === 'sending' ||
      (campaign.status === 'cancelled' && campaign.settlementPendingAt !== null))
  );
}

// A submission with no known answer is final: sending again could deliver the message twice.
export function unknownOutcome(
  failedAt: Date,
  { id, claimedAt }: { id: string; claimedAt: Date },
  credits: number | null,
) {
  return {
    recipientId: id,
    guard: { status: 'sending', claimedAt },
    change: { status: 'failed', errorCode: 'outcome_unknown', failedAt, smsCredits: credits },
  } as const;
}

// Settles a submission that was accepted or left uncertain before a worker stopped.
@Injectable()
export class CampaignReceiptReconciler {
  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(CampaignCountsService) private readonly counts: CampaignCountsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async reconcile(storeId: string, campaignId: string, receipt: ReceiptClaim) {
    const { recipientId, providerMessageId, claimedAt, credits } = receipt;
    // Messenger has no receipt lookup; an id saved before the crash means Meta accepted it.
    const result =
      receipt.channel === 'sms'
        ? await this.sms.receiptStatus({
            providerMessageId,
            idempotencyKey: `campaign-${recipientId}`,
          })
        : 'sent';
    if (result === 'unknown') {
      await this.counts.recordOutcome(
        storeId,
        campaignId,
        unknownOutcome(this.clock.now(), { id: recipientId, claimedAt }, credits),
      );
      return;
    }
    const from = {
      status: 'sending',
      uncertainReceipt: providerMessageId,
      providerMessageId,
    } as const;
    if (result === 'sent') {
      await this.counts.recordAcceptance(storeId, campaignId, {
        recipientId,
        providerMessageId,
        credits,
        sentAt: receipt.dispatchStartedAt,
        requireSavedReceipt: true,
      });
      return;
    }
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, campaignId, 'update');
      if (!campaign || !(canProcess(campaign) || campaign.status === 'paused')) return;
      const recorded = await this.repository.changeRecipient(storeId, recipientId, from, {
        status: 'failed',
        claimedAt: null,
        errorCode: 'provider_confirmed_not_sent',
        failedAt: this.clock.now(),
        smsCredits: null,
      });
      await this.counts.markPending(storeId, campaign, recorded);
    });
  }
}
