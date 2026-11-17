import { Inject, Injectable } from '@nestjs/common';

import { LinksService } from '../links/links.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { MINUTE_MS } from '../platform/time';
import { SendPolicyService } from '../sending/send-policy.service';
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
const SEND_ATTEMPTS = 3;
const SYSTEM = { kind: 'system' } as const;

type Claim =
  | { kind: 'stop' }
  | { kind: 'next' }
  | { kind: 'defer'; until: Date }
  | { kind: 'send'; recipientId: string; contactId: string; claimedAt: Date; text: string };

@Injectable()
export class CampaignSenderService {
  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Starts the campaigns now due and names every campaign sending, so a batch job lost from
  // Valkey, or a claim left by a stopped worker, is picked up again.
  async startDue(): Promise<CampaignRef[]> {
    const now = this.clock.now();
    for (const { storeId, campaignId } of await this.repository.listDue(now))
      await this.repository.start(storeId, campaignId, now);
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
      const { id, contactId } = recipient;
      if (recipient.status === 'queued') {
        const decision = await this.sendPolicy.check(storeId, {
          contactId,
          channel: 'sms',
          category: 'marketing',
          at: now,
        });
        if (decision.action === 'defer') return { kind: 'defer', until: decision.until };
        if (decision.action === 'skip') {
          await this.repository.changeRecipient(
            storeId,
            id,
            { status: 'queued' },
            { status: 'skipped', skipReason: decision.reason },
          );
          return { kind: 'next' };
        }
        // A claim in sending may already be with the provider, so it is resent, never skipped.
      } else if (recipient.sendAttempts >= SEND_ATTEMPTS) {
        await this.repository.changeRecipient(
          storeId,
          id,
          { status: 'sending' },
          {
            status: 'failed',
            errorCode: 'send_attempts_exhausted',
            failedAt: now,
            claimedAt: null,
          },
        );
        return { kind: 'next' };
      }
      await this.repository.changeRecipient(
        storeId,
        id,
        { status: recipient.status },
        { status: 'sending', claimedAt: now, sendAttempts: recipient.sendAttempts + 1 },
      );
      const link = await this.links.optOutLink(
        storeId,
        { sourceType: 'campaign', sourceId: campaignId, contactId },
        SYSTEM,
      );
      const text = marketingSmsText(campaign.content.text, link.url);
      return { kind: 'send', recipientId: id, contactId, claimedAt: now, text };
    });
  }

  // The operation key makes a resend after a crash return the first provider message id. A send
  // error leaves the claim to expire and stops the batch, so the job retries with back-off.
  private async deliver(
    storeId: string,
    { recipientId, contactId, claimedAt, text }: Extract<Claim, { kind: 'send' }>,
  ): Promise<void> {
    const sent = await this.messaging.send(storeId, {
      channel: 'sms',
      contactId,
      body: text,
      operationKey: `campaign-${recipientId}`,
    });
    await this.repository.changeRecipient(
      storeId,
      recipientId,
      { status: 'sending', claimedAt },
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
