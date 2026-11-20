import { Inject, Injectable } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { MessagingService, type SentMessage } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { MINUTE_MS } from '../platform/time';
import { SendPolicyService, type SkipReason } from '../sending/send-policy.service';
import { SmsService } from '../sms/sms.service';
import { type StoreSendingSettings, StoresService } from '../stores/stores.service';
import { CampaignCountsService } from './campaign-counts.service';
import { CampaignFundingService } from './campaign-funding.service';
import {
  CampaignMessengerSender,
  messengerBody,
  skipReasonFor,
  type MessengerPayload,
  type PageRoute,
} from './campaign-messenger-sender.service';
import {
  canProcess,
  CampaignReceiptReconciler,
  unknownOutcome,
  type ReceiptClaim,
} from './campaign-receipt-reconciler.service';
import { CampaignSendingRepository, type ClaimableRecipient } from './campaign-sending.repository';
import { CampaignSmsService } from './campaign-sms.service';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';

const BATCH_SIZE = 200;
export const CAMPAIGN_CLAIM_MS = 5 * MINUTE_MS;
const SEND_ATTEMPTS = 3;

type Submission = {
  kind: 'send';
  campaignId: string;
  recipient: ClaimableRecipient;
  claimedAt: Date;
  destination: string;
  sender: string | undefined;
  body: string;
  messenger?: MessengerPayload;
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
    @Inject(CampaignSmsService) private readonly smsText: CampaignSmsService,
    @Inject(CampaignFundingService) private readonly funding: CampaignFundingService,
    @Inject(CampaignCountsService) private readonly counts: CampaignCountsService,
    @Inject(CampaignMessengerSender) private readonly messengerSender: CampaignMessengerSender,
    @Inject(CampaignReceiptReconciler) private readonly reconciler: CampaignReceiptReconciler,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async sendBatch(storeId: string, campaignId: string): Promise<Date | null> {
    if (!(await this.funding.prepare(storeId, campaignId))) return null;
    const deadline = performance.now() + MINUTE_MS / 4;
    for (let position = 0; position < BATCH_SIZE; position++) {
      const claim = await this.claimNext(storeId, campaignId);
      if (claim.kind === 'send' && !(await this.deliver(storeId, claim))) {
        await this.counts.refresh(storeId, campaignId, 'batch');
        return null;
      }
      if (claim.kind === 'stop') {
        await this.funding.finish(storeId, campaignId);
        return null;
      }
      if (claim.kind === 'defer') {
        await this.counts.refresh(storeId, campaignId, 'force');
        return claim.until;
      }
      if (claim.kind === 'receipt') await this.reconciler.reconcile(storeId, campaignId, claim);
      if (performance.now() >= deadline) break;
    }
    await this.counts.refresh(storeId, campaignId, 'batch');
    return this.clock.now();
  }

  // Cancellation and consent changes that commit before this claim stop a new submission.
  // Provider I/O happens after the transaction releases both locks.
  private claimNext(storeId: string, campaignId: string): Promise<Claim> {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, campaignId, 'share');
      if (!campaign || !canProcess(campaign)) return { kind: 'stop' };
      const now = this.clock.now();
      const recipient = await this.repository.lockNextRecipient(
        storeId,
        campaign,
        new Date(now.getTime() - CAMPAIGN_CLAIM_MS),
      );
      if (!recipient) return { kind: 'stop' };
      if (recipient.status === 'sending') {
        const { providerMessageId } = recipient;
        if (providerMessageId)
          return this.claimReceipt(storeId, { ...recipient, providerMessageId }, now, campaign);
        if (
          !recipient.dispatchStartedAt ||
          campaign.status === 'cancelled' ||
          recipient.sendAttempts >= SEND_ATTEMPTS
        )
          return this.skipSubmission(storeId, campaign, { recipient });
      }
      return this.claimForSubmission(storeId, campaign, recipient);
    });
  }

  // Only SMS costs credits.
  private estimateCredits(campaign: LockedCampaign): number | null {
    if (campaign.channel !== 'sms') return null;
    return this.smsText.estimate(campaign.content.text, campaign.shortLinkBase ?? undefined)
      .smsParts;
  }

  private async claimForSubmission(
    storeId: string,
    campaign: LockedCampaign,
    recipient: ClaimableRecipient,
  ): Promise<Claim> {
    const { id, contactId, destinationAddress } = recipient;
    const resend = recipient.status === 'sending';
    // Channel dispatch also locks store settings before locking the contact.
    const settings = await this.stores.sendingSettings(storeId, 'share');
    const page = await this.messengerSender.route(storeId, campaign, recipient);
    const checked = await this.policy.checkForSend(storeId, {
      contactId,
      channel: campaign.channel,
      category: 'marketing',
      windowClosesAt: page?.windowClosesAt,
      excludeCampaignRecipientId: resend ? id : undefined,
    });
    const { decision } = checked;
    const destination = page ? page.address : checked.destination;
    if (decision.action === 'defer') return { kind: 'defer', until: decision.until };
    if (decision.action === 'skip' || !destination || destination !== destinationAddress)
      return this.skipSubmission(storeId, campaign, {
        recipient,
        reason: decision.action === 'skip' ? skipReasonFor(decision.reason, page) : 'no_address',
      });
    return this.saveSubmission(storeId, campaign, { recipient, destination, settings, page });
  }

  private async skipSubmission(
    storeId: string,
    campaign: LockedCampaign,
    { recipient, reason }: { recipient: ClaimableRecipient; reason?: SkipReason },
  ): Promise<Claim> {
    if (recipient.status === 'sending' && recipient.dispatchStartedAt) {
      const { recipientId, guard, change } = unknownOutcome(
        this.clock.now(),
        recipient,
        this.estimateCredits(campaign),
      );
      await this.repository.changeRecipient(storeId, recipientId, guard, change);
    } else {
      const restored = campaign.status === 'cancelled' ? 'cancelled' : 'queued';
      await this.repository.changeRecipient(
        storeId,
        recipient.id,
        { status: recipient.status },
        { status: reason ? 'skipped' : restored, claimedAt: null, skipReason: reason },
      );
    }
    return { kind: 'next' };
  }

  private async saveSubmission(
    storeId: string,
    campaign: LockedCampaign,
    input: {
      recipient: ClaimableRecipient;
      destination: string;
      settings: StoreSendingSettings;
      page: PageRoute | undefined;
    },
  ): Promise<Claim> {
    const { recipient, destination, settings, page } = input;
    const prepared = page
      ? messengerBody(campaign, recipient)
      : await this.prepareSms(storeId, campaign, recipient);
    const { body, optOutLinkCode, redirectLinkCodes, createdLinks } = prepared;
    const decide = await this.policy.prepareMarketingRetryCheck(storeId, {
      contactId: recipient.contactId,
      campaignRecipientId: recipient.id,
      channel: campaign.channel,
      settings,
    });
    const { decision, at } = decide();
    if (decision.action === 'skip')
      return this.skipSubmission(storeId, campaign, { recipient, reason: decision.reason });
    if (decision.action === 'defer' && !createdLinks)
      return { kind: 'defer', until: decision.until };
    const change =
      decision.action === 'send'
        ? { status: 'sending' as const, claimedAt: at }
        : { status: recipient.status };
    const saved = await this.repository.changeRecipient(
      storeId,
      recipient.id,
      { status: recipient.status },
      { ...change, optOutLinkCode, redirectLinkCodes },
    );
    if (decision.action === 'defer') return { kind: 'defer', until: decision.until };
    if (!saved) return { kind: 'next' };
    return {
      kind: 'send',
      campaignId: campaign.id,
      recipient,
      claimedAt: at,
      destination,
      sender: prepared.sender,
      body,
      messenger: page && prepared.messenger,
    };
  }

  private async prepareSms(
    storeId: string,
    campaign: LockedCampaign,
    recipient: ClaimableRecipient,
  ) {
    const { name: sender } = await this.messaging.prepareSender(storeId);
    // The recipient lock orders code creation with all retries of this submission.
    const prepared = await this.smsText.prepare(storeId, campaign, recipient);
    return { ...prepared, sender, messenger: undefined };
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
      channel: campaign.channel,
      credits: this.estimateCredits(campaign),
    };
  }

  private async deliver(storeId: string, submission: Submission): Promise<boolean> {
    const { recipient, claimedAt } = submission;
    const recipientId = recipient.id;
    const expiresAt = new Date(claimedAt.getTime() + CAMPAIGN_CLAIM_MS);
    const canSubmit = () => this.clock.now() < expiresAt;
    const authorized =
      canSubmit() &&
      (await this.repository
        .authorizeSubmission(storeId, recipientId, claimedAt, expiresAt)
        .catch(async (error: unknown) => {
          await this.recordRefusal(storeId, submission, true);
          throw error;
        }));
    if (!authorized || !canSubmit()) {
      await this.recordRefusal(storeId, submission, true);
      return false;
    }
    const { messenger } = submission;
    if (!messenger) return this.deliverSms(storeId, submission);
    if (await this.messengerSender.deliver(storeId, { ...submission, messenger }))
      await this.recordRefusal(storeId, submission);
    return true;
  }

  private async deliverSms(storeId: string, submission: Submission): Promise<boolean> {
    const { recipient, destination, body, claimedAt, sender } = submission;
    const { id: recipientId, contactId } = recipient;
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
        await this.counts.recordOutcome(
          storeId,
          submission.campaignId,
          unknownOutcome(this.clock.now(), { id: recipientId, claimedAt }, countSmsParts(body)),
        );
        return true;
      }
      const retry = await this.recordRefusal(storeId, submission);
      if (retry && error.code === 'SMS_SEND_REFUSED') throw error;
      return true;
    }
    await this.saveAcceptance(storeId, submission, receipt);
    return true;
  }

  private async saveAcceptance(
    storeId: string,
    submission: Submission,
    receipt: { providerMessageId: string; credits: number | null },
    note?: 'image_rejected' | false,
  ) {
    const {
      campaignId,
      recipient: { id: recipientId },
      claimedAt,
    } = submission;
    const { providerMessageId, credits } = receipt;
    const claim = { status: 'sending', claimedAt } as const;
    const knownReceipt = { status: 'sending', providerMessageId } as const;
    await this.repository.changeRecipient(storeId, recipientId, claim, knownReceipt);
    await this.counts.recordAcceptance(storeId, campaignId, {
      recipientId,
      providerMessageId,
      credits,
      sentAt: claimedAt,
      errorCode: note || undefined,
      requireSavedReceipt: false,
    });
  }

  private async recordRefusal(storeId: string, submission: Submission, unsubmitted = false) {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, submission.campaignId, 'update');
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
      const recorded = await this.repository.changeRecipient(
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
      await this.counts.markPending(storeId, campaign, recorded);
      return false;
    });
  }
}
