import { Inject, Injectable } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { LinksService } from '../links/links.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { WalletService } from '../wallets/wallet.service';
import { CampaignCountsService } from './campaign-counts.service';
import { campaignError } from './campaigns.errors';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';
import { approvalKey, CampaignsService, marketingSmsText } from './campaigns.service';

const ACTOR = { kind: 'system' } as const;
const WALLET = 'sms_credits';

type Source = 'sending' | { topUpRevision: number };

@Injectable()
export class CampaignFundingService {
  constructor(
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(CampaignsService) private readonly service: CampaignsService,
    @Inject(CampaignCountsService) private readonly counts: CampaignCountsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  prepare(storeId: string, id: string): Promise<boolean> {
    return this.transaction.run(storeId, () => this.fund(storeId, id, 'sending'));
  }

  async finish(storeId: string, id: string) {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign?.approvedAt) return;
      const now = this.clock.now();
      const cancelled = campaign.status === 'cancelled';
      const canSettle = cancelled
        ? campaign.settlementPendingAt
        : campaign.status === 'sending' && campaign.shortLinkBase;
      if (!canSettle) {
        if (!campaign.countsAt) await this.counts.refresh(storeId, id, 'batch');
        return;
      }
      const settled = await this.service.settleReservation(
        storeId,
        { id, approvedAt: campaign.approvedAt, cancelledAt: cancelled ? now : undefined },
        ACTOR,
      );
      if (cancelled) return this.counts.refresh(storeId, id, 'force');
      if (!settled) return this.counts.refresh(storeId, id, 'batch');
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

  async resumeAfterTopUp(storeId: string, entryId: string): Promise<void> {
    const topUpRevision = await this.wallets.topUpRevision(storeId, WALLET, entryId);
    if (topUpRevision === undefined) return;
    let after: string | null = null;
    for (;;) {
      const ids = await this.campaigns.listBalancePaused(storeId, topUpRevision, after);
      const last = ids.at(-1);
      if (!last) return;
      for (const id of ids)
        await this.transaction.run(storeId, () => this.fund(storeId, id, { topUpRevision }));
      after = last;
    }
  }

  private async fund(storeId: string, id: string, source: Source): Promise<boolean> {
    const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
    if (!campaign) return true;
    const reprice = needsFunding(campaign, source);
    if (!reprice && campaign.status !== 'sending') return true;
    if (!campaign.approvedAt) throw campaignError('CAMPAIGN_APPROVAL_TIME_MISSING');
    if (!reprice) return true;
    const base = this.links.shortLinkBase();
    const body = marketingSmsText(campaign.content.text, this.links.sampleOptOutUrl(base));
    const needed = countSmsParts(body) * campaign.recipientsCount;
    const key = approvalKey(id, campaign.approvedAt);
    await this.wallets.lockForReservation(storeId, WALLET);
    const reservation = await this.wallets.reservationFor(storeId, WALLET, key);
    if ((await this.wallets.balance(storeId, WALLET)) + reservation.quantity < needed) {
      await this.pause(storeId, campaign, source);
      return false;
    }
    if (reservation.quantity !== needed) {
      await this.wallets.release(storeId, {
        reservationId: reservation.entryId,
        idempotencyKey: `${key}:replace`,
        actor: ACTOR,
      });
      await this.wallets.reserve(storeId, {
        wallet: WALLET,
        quantity: needed,
        idempotencyKey: approvalKey(id, campaign.approvedAt, 'with-opt-out'),
        actor: ACTOR,
      });
    }
    await this.campaigns.changeStatus(
      storeId,
      id,
      { status: campaign.status },
      {
        status: 'sending',
        pauseReason: null,
        balancePauseRevision: null,
        shortLinkBase: base,
        startedAt: campaign.startedAt ?? campaign.approvedAt,
        updatedAt: this.clock.now(),
      },
    );
    return true;
  }

  private async pause(storeId: string, campaign: LockedCampaign, source: Source) {
    const revision = await this.wallets.currentRevision(storeId, WALLET);
    await this.campaigns.changeStatus(
      storeId,
      campaign.id,
      { status: campaign.status },
      {
        status: 'paused',
        pauseReason: 'balance',
        balancePauseRevision: revision,
        updatedAt: this.clock.now(),
      },
    );
    if (source === 'sending')
      await this.notifications.notify(storeId, {
        type: 'campaign.paused_for_balance',
        category: 'fix_now',
        dedupeKey: `campaign-balance:${campaign.id}`,
        recipientPermission: 'billing.edit',
        title: `"${campaign.name}" paused: SMS balance too low`,
        body: 'The campaign needs more SMS credits before it can send. A top-up resumes it.',
        actionUrl: '/settings',
      });
  }
}

function needsFunding(campaign: LockedCampaign, source: Source): boolean {
  if (campaign.channel !== 'sms' || campaign.shortLinkBase) return false;
  if (source === 'sending') return campaign.status === 'sending';
  return (
    campaign.status === 'paused' &&
    campaign.pauseReason === 'balance' &&
    campaign.balancePauseRevision !== null &&
    campaign.balancePauseRevision < source.topUpRevision
  );
}
