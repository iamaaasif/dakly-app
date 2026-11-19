import { Inject, Injectable, Logger } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { LinksService } from '../links/links.service';
import { MessagingService, type SentMessage } from '../messaging/messaging.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { SendPolicyService } from '../sending/send-policy.service';
import { SmsService } from '../sms/sms.service';
import { CampaignSendingRepository, type ClaimableRecipient } from './campaign-sending.repository';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';
import { CampaignsService, marketingSmsText } from './campaigns.service';

const STORES_PER_TICK = 100;
const CURSOR_LIFETIME_SECONDS = (7 * DAY_MS) / 1000;
const STORE_CURSOR = 'campaign-start:store';
const MAX_WAITING_BATCHES = 200;
const BATCH_SIZE = 200;
const CLAIM_MS = 5 * MINUTE_MS;
const SEND_ATTEMPTS = 3;
const ACTOR = { kind: 'system' } as const;

type Submission = {
  kind: 'send';
  campaignId: string;
  recipient: ClaimableRecipient;
  claimedAt: Date;
  destination: string;
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
export type CampaignBatch = { storeId: string; campaignId: string; lane: string };
type Claim =
  Submission | ReceiptClaim | { kind: 'stop' } | { kind: 'next' } | { kind: 'defer'; until: Date };

@Injectable()
export class CampaignSenderService {
  private readonly logger = new Logger(CampaignSenderService.name);

  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(SendPolicyService) private readonly policy: SendPolicyService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(CampaignsService) private readonly service: CampaignsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
  ) {}

  async startDue(
    waiting = 0,
    enqueue: (batches: CampaignBatch[]) => Promise<void> = async () => undefined,
  ): Promise<void> {
    const room = MAX_WAITING_BATCHES - waiting;
    if (room <= 0) return;
    const limit = Math.min(STORES_PER_TICK, Math.max(1, Math.floor(room / 2)));
    const now = this.clock.now();
    const after = await this.valkey.connection.get(STORE_CURSOR);
    let stores = await this.repository.listDueStores(now, after, limit);
    if (!stores.length && after) stores = await this.repository.listDueStores(now, null, limit);
    const batches: CampaignBatch[] = [];
    const before = new Date(now.getTime() - CLAIM_MS);
    for (const storeId of stores) {
      try {
        await this.repository.startDueInStore(storeId, now);
        const work = await this.repository.firstWork(storeId, before);
        batches.push(
          ...work.map(({ campaignId, status: lane }) => ({ storeId, campaignId, lane })),
        );
      } catch (error) {
        this.logger.error({ storeId }, 'Campaign starts failed for store');
        const { jobId } = jobLogBindings();
        if (jobId) this.reporter.reportJob(serializeError(error), jobId);
      }
    }
    await enqueue(batches);
    const last = stores.at(-1);
    if (last) await this.valkey.connection.set(STORE_CURSOR, last, 'EX', CURSOR_LIFETIME_SECONDS);
  }

  async sendBatch(storeId: string, campaignId: string): Promise<Date | null> {
    for (let position = 0; position < BATCH_SIZE; position++) {
      const claim = await this.claimNext(storeId, campaignId);
      if (claim.kind === 'stop') {
        await this.finish(storeId, campaignId);
        return null;
      }
      if (claim.kind === 'defer') return claim.until;
      if (claim.kind === 'send') await this.deliver(storeId, claim);
      if (claim.kind === 'receipt') await this.reconcileReceipt(storeId, claim);
    }
    return this.clock.now();
  }

  // Cancellation and consent changes that commit before this claim stop a new submission.
  // Provider I/O happens after the transaction releases both locks.
  private claimNext(storeId: string, campaignId: string): Promise<Claim> {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, campaignId, 'share');
      if (!campaign?.shortLinkBase || !canProcess(campaign)) return { kind: 'stop' };
      const now = this.clock.now();
      const recipient = await this.repository.lockNextRecipient(
        storeId,
        campaign,
        new Date(now.getTime() - CLAIM_MS),
      );
      if (!recipient) return { kind: 'stop' };
      if (recipient.status === 'sending') {
        if (recipient.providerMessageId)
          return this.claimReceipt(storeId, recipient, now, this.estimateCredits(campaign));
        if (campaign.status === 'cancelled' || recipient.sendAttempts >= SEND_ATTEMPTS)
          return this.expireClaim(storeId, campaign, recipient);
      }
      return this.claimForSubmission(storeId, campaign, recipient);
    });
  }

  private estimateCredits(campaign: LockedCampaign): number {
    const link = this.links.sampleOptOutUrl(campaign.shortLinkBase ?? undefined);
    return countSmsParts(marketingSmsText(campaign.content.text, link));
  }

  private async expireClaim(
    storeId: string,
    campaign: LockedCampaign,
    recipient: ClaimableRecipient,
  ): Promise<Claim> {
    await this.failUnknown(storeId, recipient, this.estimateCredits(campaign));
    return { kind: 'next' };
  }

  private async claimForSubmission(
    storeId: string,
    campaign: LockedCampaign,
    recipient: ClaimableRecipient,
  ): Promise<Claim> {
    const { id, contactId, destinationAddress } = recipient;
    const resend = recipient.status === 'sending';
    const { decision, destination, at } = await this.policy.checkForSend(storeId, {
      contactId,
      channel: 'sms',
      category: 'marketing',
      excludeCampaignRecipientId: resend ? id : undefined,
    });
    if (decision.action === 'defer') return { kind: 'defer', until: decision.until };
    if (decision.action === 'skip' || !destination || destination !== destinationAddress) {
      if (resend) return this.expireClaim(storeId, campaign, recipient);
      await this.repository.changeRecipient(
        storeId,
        id,
        { status: 'queued' },
        {
          status: 'skipped',
          skipReason: decision.action === 'skip' ? decision.reason : 'no_address',
        },
      );
      return { kind: 'next' };
    }
    return this.saveSubmission(storeId, campaign, { recipient, destination, at });
  }

  private async saveSubmission(
    storeId: string,
    campaign: LockedCampaign,
    {
      recipient,
      destination,
      at,
    }: { recipient: ClaimableRecipient; destination: string; at: Date },
  ): Promise<Claim> {
    // The recipient lock orders code creation with all retries of this submission.
    const source = {
      sourceType: 'campaign',
      sourceId: campaign.id,
      contactId: recipient.contactId,
      kind: 'sms_opt_out',
    } as const;
    const code =
      recipient.optOutLinkCode ?? (await this.links.create(storeId, [source], ACTOR))[0]!.code;
    const change = {
      status: 'sending',
      claimedAt: at,
      dispatchStartedAt: at,
      sendAttempts: recipient.sendAttempts + 1,
      optOutLinkCode: code,
    } as const;
    if (
      !(await this.repository.changeRecipient(
        storeId,
        recipient.id,
        { status: recipient.status },
        change,
      ))
    )
      return { kind: 'next' };
    const url = this.links.optOutUrl(code, campaign.shortLinkBase ?? undefined);
    const body = marketingSmsText(campaign.content.text, url);
    return { kind: 'send', campaignId: campaign.id, recipient, claimedAt: at, destination, body };
  }

  private async claimReceipt(
    storeId: string,
    recipient: ClaimableRecipient,
    claimedAt: Date,
    credits: number,
  ): Promise<Claim> {
    if (!recipient.providerMessageId || !recipient.claimedAt) return { kind: 'next' };
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
      credits,
    };
  }

  private async reconcileReceipt(storeId: string, receipt: ReceiptClaim) {
    const { recipientId, providerMessageId, claimedAt, credits } = receipt;
    const result = await this.sms.receiptStatus({
      providerMessageId,
      idempotencyKey: `campaign-${recipientId}`,
    });
    const from = { status: 'sending', claimedAt } as const;
    const now = this.clock.now();
    await this.repository.changeRecipient(
      storeId,
      recipientId,
      from,
      result === 'sent'
        ? {
            status: 'sent',
            claimedAt: null,
            smsCredits: credits,
            sentAt: receipt.dispatchStartedAt,
          }
        : {
            status: 'failed',
            claimedAt: result === 'not_sent' ? null : undefined,
            errorCode: result === 'not_sent' ? 'provider_confirmed_not_sent' : 'outcome_unknown',
            failedAt: now,
            smsCredits: result === 'not_sent' ? null : credits,
          },
    );
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

  private async deliver(storeId: string, submission: Submission): Promise<void> {
    const { recipient, destination, body, claimedAt } = submission;
    const { id: recipientId, contactId } = recipient;
    let receipt: SentMessage;
    try {
      const { name: sender } = await this.messaging.prepareSender(storeId);
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

  private async recordRefusal(storeId: string, submission: Submission): Promise<boolean> {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, submission.campaignId, 'share');
      const cancelled = campaign?.status === 'cancelled';
      const terminal = cancelled || submission.recipient.sendAttempts + 1 >= SEND_ATTEMPTS;
      const changed = await this.repository.changeRecipient(
        storeId,
        submission.recipient.id,
        { status: 'sending', claimedAt: submission.claimedAt },
        terminal
          ? {
              status: 'failed',
              errorCode: cancelled ? 'provider_confirmed_not_sent' : 'send_attempts_exhausted',
              failedAt: this.clock.now(),
              claimedAt: null,
              smsCredits: null,
            }
          : { status: 'queued', claimedAt: null, dispatchStartedAt: null },
      );
      return changed && !terminal;
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
      await this.outbox.publish({
        type: 'campaign.sent',
        storeId,
        occurredAt: now.toISOString(),
        payload: { campaignId: id },
      });
    });
  }
}

function canProcess(campaign: LockedCampaign): boolean {
  return (
    campaign.status === 'sending' ||
    (campaign.status === 'cancelled' && campaign.settlementPendingAt !== null)
  );
}
