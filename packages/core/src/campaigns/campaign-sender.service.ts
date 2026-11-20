import { Inject, Injectable } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { LinksService } from '../links/links.service';
import { MessagingService, type SentMessage } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { MINUTE_MS } from '../platform/time';
import { SendPolicyService, type SkipReason } from '../sending/send-policy.service';
import { SmsService } from '../sms/sms.service';
import { type StoreSendingSettings, StoresService } from '../stores/stores.service';
import { CampaignFundingService } from './campaign-funding.service';
import { CampaignSendingRepository, type ClaimableRecipient } from './campaign-sending.repository';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';
import { CampaignsService, marketingSmsText } from './campaigns.service';

const BATCH_SIZE = 200;
export const CAMPAIGN_CLAIM_MS = 5 * MINUTE_MS;
const SEND_ATTEMPTS = 3;
const ACTOR = { kind: 'system' } as const;

type Submission = {
  kind: 'send';
  campaignId: string;
  recipient: ClaimableRecipient;
  claimedAt: Date;
  destination: string;
  sender: string | undefined;
  body: string;
};
type ReceiptClaim = {
  kind: 'receipt';
  recipientId: string;
  providerMessageId: string;
  claimedAt: Date;
  dispatchStartedAt: Date;
  credits: number;
};
type Claim =
  Submission | ReceiptClaim | { kind: 'stop' } | { kind: 'next' } | { kind: 'defer'; until: Date };

@Injectable()
export class CampaignSenderService {
  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(SendPolicyService) private readonly policy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(CampaignsService) private readonly service: CampaignsService,
    @Inject(CampaignFundingService) private readonly funding: CampaignFundingService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async sendBatch(
    storeId: string,
    campaignId: string,
    hasLease = () => true,
  ): Promise<Date | null> {
    if (!(await this.funding.prepare(storeId, campaignId))) return null;
    const deadline = performance.now() + MINUTE_MS / 4;
    for (let position = 0; position < BATCH_SIZE; position++) {
      const claim = await this.claimNext(storeId, campaignId, hasLease);
      if (claim.kind === 'send') await this.deliver(storeId, claim, hasLease);
      if (!hasLease()) return null;
      if (claim.kind === 'stop') {
        await this.finish(storeId, campaignId);
        return null;
      }
      if (claim.kind === 'defer') return claim.until;
      if (claim.kind === 'receipt') await this.reconcileReceipt(storeId, campaignId, claim);
      if (performance.now() >= deadline) break;
    }
    return this.clock.now();
  }

  // Cancellation and consent changes that commit before this claim stop a new submission.
  // Provider I/O happens after the transaction releases both locks.
  private claimNext(storeId: string, campaignId: string, hasLease: () => boolean): Promise<Claim> {
    if (!hasLease()) return Promise.resolve({ kind: 'stop' });
    return this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, campaignId, 'share');
      if (!campaign?.shortLinkBase || !canProcess(campaign)) return { kind: 'stop' };
      const now = this.clock.now();
      const recipient = await this.repository.lockNextRecipient(
        storeId,
        campaign,
        new Date(now.getTime() - CAMPAIGN_CLAIM_MS),
      );
      if (!recipient || !hasLease()) return { kind: 'stop' };
      if (recipient.status === 'sending') {
        const { providerMessageId } = recipient;
        if (providerMessageId)
          return this.claimReceipt(storeId, { ...recipient, providerMessageId }, now, campaign);
        if (campaign.status === 'cancelled' || recipient.sendAttempts >= SEND_ATTEMPTS)
          return this.skipSubmission(storeId, campaign, { recipient });
      }
      return this.claimForSubmission(storeId, campaign, recipient, hasLease);
    });
  }

  private estimateCredits(campaign: LockedCampaign): number {
    const link = this.links.sampleOptOutUrl(campaign.shortLinkBase ?? undefined);
    return countSmsParts(marketingSmsText(campaign.content.text, link));
  }

  private async claimForSubmission(
    storeId: string,
    campaign: LockedCampaign,
    recipient: ClaimableRecipient,
    hasLease: () => boolean,
  ): Promise<Claim> {
    const { id, contactId, destinationAddress } = recipient;
    const resend = recipient.status === 'sending';
    // Channel dispatch also locks store settings before locking the contact.
    const settings = await this.stores.sendingSettings(storeId, 'share');
    const { decision, destination } = await this.policy.checkForSend(storeId, {
      contactId,
      channel: 'sms',
      category: 'marketing',
      excludeCampaignRecipientId: resend ? id : undefined,
    });
    if (decision.action === 'defer') return { kind: 'defer', until: decision.until };
    if (decision.action === 'skip' || !destination || destination !== destinationAddress)
      return this.skipSubmission(storeId, campaign, {
        recipient,
        reason: decision.action === 'skip' ? decision.reason : 'no_address',
      });
    return this.saveSubmission(storeId, campaign, { recipient, destination, settings }, hasLease);
  }

  private async skipSubmission(
    storeId: string,
    campaign: LockedCampaign,
    { recipient, reason }: { recipient: ClaimableRecipient; reason?: SkipReason },
  ): Promise<Claim> {
    if (recipient.status === 'sending')
      await this.failUnknown(storeId, recipient, this.estimateCredits(campaign));
    else if (reason)
      await this.repository.changeRecipient(
        storeId,
        recipient.id,
        { status: 'queued' },
        {
          status: 'skipped',
          skipReason: reason,
        },
      );
    return { kind: 'next' };
  }

  private async saveSubmission(
    storeId: string,
    campaign: LockedCampaign,
    input: { recipient: ClaimableRecipient; destination: string; settings: StoreSendingSettings },
    hasLease: () => boolean,
  ): Promise<Claim> {
    const { recipient, destination, settings } = input;
    const { name: sender } = await this.messaging.prepareSender(storeId);
    // The recipient lock orders code creation with all retries of this submission.
    const source = {
      sourceType: 'campaign',
      sourceId: campaign.id,
      contactId: recipient.contactId,
      kind: 'sms_opt_out',
    } as const;
    const code =
      recipient.optOutLinkCode ?? (await this.links.create(storeId, [source], ACTOR))[0]!.code;
    const decide = await this.policy.prepareMarketingRetryCheck(storeId, {
      contactId: recipient.contactId,
      campaignRecipientId: recipient.id,
      settings,
    });
    const { decision, at } = decide();
    if (!hasLease()) return { kind: 'stop' };
    if (decision.action === 'skip')
      return this.skipSubmission(storeId, campaign, { recipient, reason: decision.reason });
    if (decision.action === 'defer' && recipient.optOutLinkCode)
      return { kind: 'defer', until: decision.until };
    const change =
      decision.action === 'send'
        ? {
            status: 'sending' as const,
            claimedAt: at,
            dispatchStartedAt: at,
            sendAttempts: recipient.sendAttempts + 1,
          }
        : { status: recipient.status };
    const saved = await this.repository.changeRecipient(
      storeId,
      recipient.id,
      { status: recipient.status },
      { ...change, optOutLinkCode: code },
    );
    if (decision.action === 'defer') return { kind: 'defer', until: decision.until };
    if (!saved) return { kind: 'next' };
    const url = this.links.optOutUrl(code, campaign.shortLinkBase ?? undefined);
    const body = marketingSmsText(campaign.content.text, url);
    return {
      kind: 'send',
      campaignId: campaign.id,
      recipient,
      claimedAt: at,
      destination,
      sender,
      body,
    };
  }

  private async claimReceipt(
    storeId: string,
    recipient: ClaimableRecipient & { status: 'sending'; providerMessageId: string },
    claimedAt: Date,
    campaign: LockedCampaign,
  ): Promise<Claim> {
    const dispatchStartedAt = recipient.dispatchStartedAt ?? recipient.claimedAt;
    const claimed = await this.repository.changeRecipient(
      storeId,
      recipient.id,
      { status: 'sending' },
      { status: 'sending', claimedAt, dispatchStartedAt, sendAttempts: recipient.sendAttempts },
    );
    if (!claimed) return { kind: 'next' };
    return {
      kind: 'receipt',
      recipientId: recipient.id,
      providerMessageId: recipient.providerMessageId,
      claimedAt,
      dispatchStartedAt,
      credits: this.estimateCredits(campaign),
    };
  }

  private async reconcileReceipt(storeId: string, campaignId: string, receipt: ReceiptClaim) {
    const { recipientId, providerMessageId, claimedAt, credits } = receipt;
    const result = await this.sms.receiptStatus({
      providerMessageId,
      idempotencyKey: `campaign-${recipientId}`,
    });
    if (result === 'unknown') {
      await this.failUnknown(storeId, { id: recipientId, claimedAt }, credits);
      return;
    }
    const from = {
      status: 'sending',
      uncertainReceipt: providerMessageId,
      providerMessageId,
    } as const;
    if (result === 'sent') {
      await this.repository.changeRecipient(storeId, recipientId, from, {
        status: 'sent',
        claimedAt: null,
        smsCredits: credits,
        sentAt: receipt.dispatchStartedAt,
        errorCode: null,
        failedAt: null,
      });
      return;
    }
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, campaignId, 'share');
      if (!campaign || !(canProcess(campaign) || campaign.status === 'paused')) return;
      await this.repository.changeRecipient(storeId, recipientId, from, {
        status: 'failed',
        claimedAt: null,
        errorCode: 'provider_confirmed_not_sent',
        failedAt: this.clock.now(),
        smsCredits: null,
      });
    });
  }

  private failUnknown(
    storeId: string,
    { id, claimedAt }: { id: string; claimedAt?: Date | null },
    credits: number,
  ) {
    return this.repository.changeRecipient(
      storeId,
      id,
      { status: 'sending', claimedAt: claimedAt ?? undefined },
      {
        status: 'failed',
        errorCode: 'outcome_unknown',
        failedAt: this.clock.now(),
        smsCredits: credits,
      },
    );
  }

  private async deliver(
    storeId: string,
    submission: Submission,
    hasLease: () => boolean,
  ): Promise<void> {
    const { recipient, destination, body, claimedAt, sender } = submission;
    const { id: recipientId, contactId } = recipient;
    const current = await this.repository.isCurrentClaim(storeId, recipientId, claimedAt);
    if (
      !current ||
      !hasLease() ||
      this.clock.now().getTime() - claimedAt.getTime() >= CAMPAIGN_CLAIM_MS
    ) {
      await this.recordRefusal(storeId, submission, true);
      return;
    }
    let receipt: SentMessage;
    try {
      receipt = await this.messaging.send(
        storeId,
        {
          channel: 'sms',
          contactId,
          body,
          destination,
          operationKey: `campaign-${recipientId}`,
        },
        { storeId, contactId, to: destination, sender },
      );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      if (recipient.status === 'sending') {
        await this.failUnknown(storeId, { id: recipientId, claimedAt }, countSmsParts(body));
        return;
      }
      const retry = await this.recordRefusal(storeId, submission);
      if (retry && error.code === 'SMS_SEND_REFUSED') throw error;
      return;
    }
    const { providerMessageId, credits } = receipt;
    const claim = { status: 'sending', claimedAt } as const;
    const knownReceipt = { status: 'sending', providerMessageId } as const;
    await this.repository.changeRecipient(storeId, recipientId, claim, knownReceipt);
    // A late acceptance also replaces an uncertain outcome that kept the credits.
    await this.repository.changeRecipient(
      storeId,
      recipientId,
      { status: 'sending', uncertainReceipt: providerMessageId },
      {
        status: 'sent',
        providerMessageId,
        smsCredits: credits,
        sentAt: claimedAt,
        claimedAt: null,
        errorCode: null,
        failedAt: null,
      },
    );
  }

  private async recordRefusal(storeId: string, submission: Submission, unsubmitted = false) {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, submission.campaignId, 'share');
      if (!campaign || !(canProcess(campaign) || campaign.status === 'paused')) return false;
      const cancelled = campaign.status === 'cancelled';
      const { recipient, claimedAt } = submission;
      if (unsubmitted)
        return this.repository.restoreUnsubmitted(storeId, recipient, claimedAt, cancelled);
      const { id, sendAttempts } = recipient;
      const claim = { status: 'sending', claimedAt } as const;
      const exhausted = !cancelled && sendAttempts + 1 >= SEND_ATTEMPTS;
      if (!exhausted && !cancelled) {
        const requeued = await this.repository.changeRecipient(storeId, id, claim, {
          status: 'queued',
          claimedAt: null,
          dispatchStartedAt: null,
        });
        if (requeued) return true;
      }
      await this.repository.changeRecipient(
        storeId,
        id,
        { ...claim, uncertainReceipt: null },
        {
          status: 'failed',
          errorCode: exhausted ? 'send_attempts_exhausted' : 'provider_confirmed_not_sent',
          failedAt: this.clock.now(),
          claimedAt: null,
          smsCredits: null,
        },
      );
      return false;
    });
  }

  private async finish(storeId: string, id: string) {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign?.approvedAt) return;
      const now = this.clock.now();
      const active = campaign.status === 'sending' && campaign.shortLinkBase;
      const cancelledAt =
        campaign.status === 'cancelled' && campaign.settlementPendingAt ? now : undefined;
      if (!active && !cancelledAt) return;
      const settled = await this.service.settleReservation(
        storeId,
        { id, approvedAt: campaign.approvedAt, cancelledAt },
        ACTOR,
      );
      if (!settled || cancelledAt) return;
      await this.campaigns.changeStatus(
        storeId,
        id,
        { status: 'sending' },
        { status: 'sent', finishedAt: now, updatedAt: now },
      );
    });
  }
}

function canProcess(campaign: LockedCampaign): boolean {
  return (
    campaign.status === 'sending' ||
    (campaign.status === 'cancelled' && campaign.settlementPendingAt !== null)
  );
}
