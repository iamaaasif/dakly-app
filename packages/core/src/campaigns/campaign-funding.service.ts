import { Inject, Injectable } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { LinksService } from '../links/links.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { WalletService } from '../wallets/wallet.service';
import { approvalKey, marketingSmsText, replacementKey } from './campaign-sms';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';

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
  ) {}

  prepare(storeId: string, id: string): Promise<boolean> {
    return this.transaction.run(storeId, () => this.fund(storeId, id, 'sending'));
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
    if (!campaign || !needsFunding(campaign, source)) return true;
    if (!campaign.approvedAt) throw new Error('Sending campaign has no approval time');
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
        idempotencyKey: replacementKey(key),
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
