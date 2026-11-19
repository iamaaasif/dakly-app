import { describe, expect, it, vi } from 'vitest';

import type { LinksService } from '../links/links.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { WalletService } from '../wallets/wallet.service';
import { CampaignFundingService } from './campaign-funding.service';
import type { CampaignsRepository } from './campaigns.repository';

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const campaignId = '019c01ea-cf15-7d31-a7f5-d73d66007ad8';
const approvedAt = new Date('2026-11-16T04:00:00Z');
const now = new Date('2026-11-16T05:00:00Z');
const base = 'https://short.example.test';
const reservationId = '019c01ea-cf15-7d31-a7f5-d73d66007ad9';
const originalKey = `campaign-approval:${campaignId}:${approvedAt.toISOString()}`;

function fixture(status: 'sending' | 'paused' = 'sending') {
  const campaign = {
    id: campaignId,
    name: 'Eid offer',
    approvedAt,
    channel: 'sms',
    content: { text: 'a'.repeat(150) },
    recipientsCount: 2,
    status,
    shortLinkBase: null,
    startedAt: null,
    pauseReason: status === 'paused' ? 'balance' : null,
    balancePauseRevision: status === 'paused' ? 8 : null,
  };
  const campaigns = {
    lockCampaign: vi.fn().mockResolvedValue(campaign),
    listBalancePaused: vi.fn(async (_storeId: string, revision: number, after: string | null) =>
      !after && campaign.balancePauseRevision !== null && campaign.balancePauseRevision < revision
        ? [campaignId]
        : [],
    ),
    changeStatus: vi.fn(async (_storeId, _id, _from, change) => Object.assign(campaign, change)),
  };
  const wallets = {
    lockForReservation: vi.fn(),
    reservationFor: vi.fn().mockResolvedValue({ entryId: reservationId, quantity: 2 }),
    balance: vi.fn().mockResolvedValue(1),
    currentRevision: vi.fn().mockResolvedValue(8),
    topUpRevision: vi.fn().mockResolvedValue(9),
    release: vi.fn(),
    reserve: vi.fn(),
  };
  const links = {
    shortLinkBase: () => base,
    sampleOptOutUrl: (selected: string) => `${selected}/s/00000000`,
  };
  const notification = { notify: vi.fn() };
  const transaction = { run: <T>(_store: string, work: () => Promise<T>) => work() };
  const service = new CampaignFundingService(
    campaigns as unknown as CampaignsRepository,
    wallets as unknown as WalletService,
    links as unknown as LinksService,
    notification as unknown as NotificationsService,
    transaction as StoreTransaction,
    { now: () => now } as Clock,
  );
  return { service, campaigns, wallets, notification };
}

describe('legacy campaign SMS funding', () => {
  it('keeps the original reservation and pauses before an unaffordable first send', async () => {
    const { service, campaigns, wallets, notification } = fixture();

    expect(await service.prepare(storeId, campaignId)).toBe(false);
    expect(wallets.lockForReservation).toHaveBeenCalledWith(storeId, 'sms_credits');
    expect(wallets.reservationFor).toHaveBeenCalledWith(storeId, 'sms_credits', originalKey);
    expect(wallets.release).not.toHaveBeenCalled();
    expect(wallets.reserve).not.toHaveBeenCalled();
    expect(campaigns.changeStatus).toHaveBeenCalledWith(
      storeId,
      campaignId,
      { status: 'sending' },
      { status: 'paused', pauseReason: 'balance', balancePauseRevision: 8, updatedAt: now },
    );
    expect(notification.notify).toHaveBeenCalledWith(
      storeId,
      expect.objectContaining({
        type: 'campaign.paused_for_balance',
        recipientPermission: 'billing.edit',
      }),
    );
  });

  it('replaces the reservation and freezes the base before an affordable send', async () => {
    const { service, campaigns, wallets, notification } = fixture();
    wallets.balance.mockResolvedValue(2);

    expect(await service.prepare(storeId, campaignId)).toBe(true);
    expect(wallets.release).toHaveBeenCalledWith(
      storeId,
      expect.objectContaining({ reservationId }),
    );
    expect(wallets.reserve).toHaveBeenCalledWith(
      storeId,
      expect.objectContaining({
        wallet: 'sms_credits',
        quantity: 4,
      }),
    );
    expect(campaigns.changeStatus).toHaveBeenCalledWith(
      storeId,
      campaignId,
      { status: 'sending' },
      expect.objectContaining({ status: 'sending', shortLinkBase: base }),
    );
    expect(notification.notify).not.toHaveBeenCalled();
  });

  it('requires a verified top-up and affordability before resuming a balance pause', async () => {
    const { service, campaigns, wallets, notification } = fixture('paused');
    wallets.topUpRevision.mockResolvedValueOnce(undefined);
    await service.resumeAfterTopUp(storeId, reservationId);
    expect(campaigns.listBalancePaused).not.toHaveBeenCalled();

    wallets.currentRevision.mockResolvedValue(9);
    await service.resumeAfterTopUp(storeId, reservationId);
    expect(campaigns.lockCampaign).toHaveBeenCalledWith(storeId, campaignId, 'update');
    expect(campaigns.changeStatus).toHaveBeenLastCalledWith(
      storeId,
      campaignId,
      { status: 'paused' },
      expect.objectContaining({ status: 'paused', balancePauseRevision: 9 }),
    );
    expect(wallets.reserve).not.toHaveBeenCalled();
    expect(notification.notify).not.toHaveBeenCalled();

    wallets.topUpRevision.mockResolvedValue(10);
    wallets.balance.mockResolvedValue(2);
    await service.resumeAfterTopUp(storeId, reservationId);
    expect(campaigns.changeStatus).toHaveBeenLastCalledWith(
      storeId,
      campaignId,
      { status: 'paused' },
      expect.objectContaining({
        status: 'sending',
        pauseReason: null,
        balancePauseRevision: null,
        shortLinkBase: base,
      }),
    );
    expect(wallets.reserve).toHaveBeenCalledTimes(1);
  });
});
