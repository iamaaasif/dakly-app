import { Inject, Injectable, Logger } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { LinksService } from '../links/links.service';
import { MessagingService, type SentMessage } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { MINUTE_MS } from '../platform/time';
import { type SendDecision, SendPolicyService } from '../sending/send-policy.service';
import { WalletService } from '../wallets/wallet.service';
import {
  type CampaignRef,
  CampaignSendingRepository,
  type SendingCampaign,
} from './campaign-sending.repository';
import { CampaignsRepository } from './campaigns.repository';
import { approvalKey, marketingSmsText } from './campaigns.service';

const BATCH_SIZE = 200;
// A worker that stopped after claiming leaves the recipient in sending; after this the claim
// is taken again and the message resent under the same operation key.
const CLAIM_MS = 5 * MINUTE_MS;
// Provider calls per recipient, first sends and resends together, so a message that never
// resolves stops being tried.
const SEND_ATTEMPTS = 3;
const SYSTEM = { kind: 'system' } as const;

type Claim =
  | { kind: 'stop' }
  | { kind: 'next' }
  | { kind: 'defer'; until: Date }
  | {
      kind: 'send';
      recipientId: string;
      contactId: string;
      destinationAddress: string | null;
      claimedAt: Date;
      sendAttempts: number;
      // An earlier call under the same key may have reached the provider.
      resend: boolean;
      text: string;
    };

@Injectable()
export class CampaignSenderService {
  private readonly logger = new Logger(CampaignSenderService.name);

  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Starts the campaigns now due and names every campaign sending, so a batch job lost from
  // Valkey, or a claim left by a stopped worker, is picked up again.
  async startDue(): Promise<CampaignRef[]> {
    const now = this.clock.now();
    for (const { storeId, campaignId } of await this.repository.listDue(now))
      await this.repository.start(storeId, campaignId, now).catch((error: unknown) => {
        this.logger.error({ storeId, campaignId }, 'Campaign start failed');
        const { jobId } = jobLogBindings();
        if (jobId) this.reporter.reportJob(serializeError(error), jobId);
      });
    return this.repository.listSending();
  }

  // Sends up to one batch and returns when the next batch should run, or null when the campaign
  // is finished, paused or cancelled.
  async sendBatch(storeId: string, campaignId: string): Promise<Date | null> {
    for (let claimed = 0; claimed < BATCH_SIZE; claimed += 1) {
      const claim = await this.claimNext(storeId, campaignId);
      if (claim.kind === 'stop') {
        await this.finish(storeId, campaignId);
        return null;
      }
      if (claim.kind === 'defer') return claim.until;
      if (claim.kind === 'send') await this.deliver(storeId, claim);
    }
    return this.clock.now();
  }

  // One short transaction per recipient: the send gate's lock is held only until the recipient
  // is marked sending, and the provider is called after the commit.
  private claimNext(storeId: string, campaignId: string): Promise<Claim> {
    return this.transaction.run(storeId, async (): Promise<Claim> => {
      const campaign = await this.repository.lockSending(storeId, campaignId);
      if (!campaign) return { kind: 'stop' };
      const now = this.clock.now();
      const recipient = await this.repository.lockNextRecipient(
        storeId,
        campaignId,
        new Date(now.getTime() - CLAIM_MS),
      );
      if (!recipient) return { kind: 'stop' };
      const { id, contactId, destinationAddress } = recipient;
      const resend = recipient.status === 'sending';
      const decision = await this.decide(storeId, { contactId, destinationAddress, resend, now });
      if (decision.action === 'defer') return { kind: 'defer', until: decision.until };
      if (!resend && decision.action === 'skip') {
        await this.repository.changeRecipient(
          storeId,
          id,
          { status: 'queued' },
          { status: 'skipped', skipReason: decision.reason },
        );
        return { kind: 'next' };
      }
      const text = await this.text(storeId, campaign, contactId);
      if (resend && (decision.action === 'skip' || recipient.sendAttempts >= SEND_ATTEMPTS)) {
        await this.failUnknown(storeId, id, { status: 'sending' }, text);
        return { kind: 'next' };
      }
      const sendAttempts = recipient.sendAttempts + 1;
      await this.repository.changeRecipient(
        storeId,
        id,
        { status: recipient.status },
        { status: 'sending', claimedAt: now, sendAttempts },
      );
      return {
        kind: 'send',
        recipientId: id,
        contactId,
        destinationAddress,
        claimedAt: now,
        sendAttempts,
        resend,
        text,
      };
    });
  }

  // A queued recipient has not reached the provider, including one the provider refused, so the
  // frozen phone and the send gate are checked; a phone changed since approval is never sent to.
  // A resend after an expired claim may follow a message the provider took (feature 09): quiet
  // hours defer it, and a withdrawal or block stops it for good; nothing else does.
  private async decide(
    storeId: string,
    {
      contactId,
      destinationAddress,
      resend,
      now,
    }: { contactId: string; destinationAddress: string | null; resend: boolean; now: Date },
  ): Promise<SendDecision> {
    if (!resend) {
      const [contact] = await this.contacts.findRecipients(storeId, [contactId]);
      if (contact?.phone !== destinationAddress) return { action: 'skip', reason: 'no_address' };
    }
    const decision = await this.sendPolicy.check(storeId, {
      contactId,
      channel: 'sms',
      category: 'marketing',
      at: now,
    });
    if (!resend || decision.action !== 'skip') return decision;
    return decision.reason === 'no_consent' || decision.reason === 'blocked'
      ? decision
      : { action: 'send' };
  }

  // Finds the contact's one opt-out link for the campaign, so a resend carries the same text.
  private async text(storeId: string, campaign: SendingCampaign, contactId: string) {
    const link = await this.links.optOutLink(
      storeId,
      { sourceType: 'campaign', sourceId: campaign.id, contactId },
      SYSTEM,
    );
    return marketingSmsText(campaign.content.text, link.url);
  }

  // The provider may have sent and billed the message, so it is charged and never sent again.
  private failUnknown(
    storeId: string,
    recipientId: string,
    from: { status: 'sending'; claimedAt?: Date },
    text: string,
  ): Promise<void> {
    return this.repository.changeRecipient(storeId, recipientId, from, {
      status: 'failed',
      errorCode: 'outcome_unknown',
      failedAt: this.clock.now(),
      claimedAt: null,
      smsCredits: countSmsParts(text),
    });
  }

  // The operation key makes a resend after a crash or an expired claim return the first provider
  // message id. An AppError from messaging means the provider did not take this call: a refusal
  // (SMS_SEND_REFUSED, the driver contract) or a check before the call. A first send then goes
  // back to the queue, so its next claim runs every check again, and fails at no cost after the
  // last attempt. A resend never goes back: an earlier call may have been taken. Any other error
  // is an unknown outcome: the claim is left to expire and the same key is tried again.
  private async deliver(storeId: string, claim: Extract<Claim, { kind: 'send' }>): Promise<void> {
    const { recipientId, claimedAt } = claim;
    const claimed = { status: 'sending', claimedAt } as const;
    let sent: SentMessage;
    try {
      sent = await this.messaging.send(storeId, {
        channel: 'sms',
        contactId: claim.contactId,
        body: claim.text,
        operationKey: `campaign-${recipientId}`,
        destination: claim.destinationAddress,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      if (claim.resend) return this.failUnknown(storeId, recipientId, claimed, claim.text);
      const exhausted = claim.sendAttempts >= SEND_ATTEMPTS;
      await this.repository.changeRecipient(
        storeId,
        recipientId,
        claimed,
        exhausted
          ? {
              status: 'failed',
              errorCode: 'send_attempts_exhausted',
              failedAt: this.clock.now(),
              claimedAt: null,
              smsCredits: null,
            }
          : { status: 'queued', claimedAt: null },
      );
      // A refusal waits for the job's back-off; a check that refused is run again now.
      if (exhausted || error.code !== 'SMS_SEND_REFUSED') return;
      throw error;
    }
    // Guarded on sending only: whichever worker holds the provider's answer records it, and the
    // same key gives every worker the same message id.
    await this.repository.changeRecipient(
      storeId,
      recipientId,
      { status: 'sending' },
      {
        status: 'sent',
        providerMessageId: sent.providerMessageId,
        smsCredits: sent.credits,
        sentAt: this.clock.now(),
        claimedAt: null,
      },
    );
  }

  // Once no recipient is queued or sending, the one reservation is settled: the credits of the
  // messages the provider took are charged and the rest released, so skips and failures cost
  // nothing.
  private async finish(storeId: string, campaignId: string): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.repository.lockForFinish(storeId, campaignId);
      if (!campaign) return;
      const { unsettled, chargedCredits } = await this.repository.settlement(storeId, campaignId);
      if (unsettled > 0) return;
      const now = this.clock.now();
      await this.campaigns.changeStatus(
        storeId,
        campaignId,
        { status: 'sending' },
        {
          status: 'sent',
          finishedAt: now,
          updatedAt: now,
        },
      );
      await this.outbox.publish({
        type: 'campaign.sent',
        storeId,
        occurredAt: now.toISOString(),
        payload: { campaignId },
      });
      await this.settle(storeId, campaign, chargedCredits);
    });
  }

  // Last, so the wallet lock is held only until commit.
  private async settle(
    storeId: string,
    campaign: SendingCampaign,
    chargedCredits: number,
  ): Promise<void> {
    // Approval sets the time before a campaign can send.
    const key = approvalKey(campaign.id, campaign.approvedAt!);
    const reservation = await this.wallets.findByIdempotencyKey(storeId, key);
    const reservationId = reservation!.entryId;
    if (chargedCredits === 0)
      await this.wallets.release(storeId, {
        reservationId,
        idempotencyKey: `${key}:release`,
        actor: SYSTEM,
      });
    else
      await this.wallets.charge(storeId, {
        reservationId,
        quantity: chargedCredits,
        idempotencyKey: `${key}:charge`,
        actor: SYSTEM,
      });
  }
}
