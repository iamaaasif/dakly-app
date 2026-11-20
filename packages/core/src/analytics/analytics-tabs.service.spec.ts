import { describe, expect, it } from 'vitest';

import type { AutomationsService } from '../automations/automations.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import { AnalyticsTabsService } from './analytics-tabs.service';
import type { AnalyticsService } from './analytics.service';

const range = { from: '2026-11-01', through: '2026-11-30', timeZone: 'Asia/Dhaka' };

type CampaignInput = {
  id: string;
  name?: string;
  channel?: 'sms' | 'whatsapp' | 'messenger';
  delivered: number;
  costPoisha: number;
  orders: number;
  revenue: number;
};

function service(
  campaigns: CampaignInput[],
  automations: {
    id: string;
    entered?: number;
    costPoisha: number;
    orders: number;
    revenue: number;
  }[] = [],
) {
  const results = Object.fromEntries(
    [...campaigns, ...automations].map(({ id, orders, revenue }) => [
      id,
      { orders: String(orders), revenuePoisha: String(revenue) },
    ]),
  );
  return new AnalyticsTabsService(
    { attributionBySource: async () => results } as unknown as AnalyticsService,
    {
      startedBetween: async () =>
        campaigns.map((row) => ({
          name: row.id,
          channel: 'sms',
          startedAt: new Date('2026-11-10T06:00:00Z'),
          sent: row.delivered,
          tappedPeople: 0,
          ...row,
        })),
    } as unknown as CampaignsService,
    {
      liveInRange: async () =>
        automations.map((row) => ({
          name: row.id,
          status: 'active',
          channels: 'whatsapp',
          entered: 10,
          sent: 10,
          ...row,
        })),
    } as unknown as AutomationsService,
  );
}

const noChannels: Parameters<AnalyticsTabsService['best']>[2] = [];

describe('analytics best cards', () => {
  it('picks the campaign with the best return among campaigns that have enough people and orders', async () => {
    const best = await service([
      { id: 'big-money', delivered: 500, costPoisha: 100_000, orders: 40, revenue: 2_000_000 },
      { id: 'best-return', delivered: 150, costPoisha: 10_000, orders: 3, revenue: 1_000_000 },
      { id: 'too-few-people', delivered: 99, costPoisha: 100, orders: 9, revenue: 9_000_000 },
      { id: 'too-few-orders', delivered: 500, costPoisha: 100, orders: 2, revenue: 9_000_000 },
      { id: 'free', delivered: 500, costPoisha: 0, orders: 9, revenue: 9_000_000 },
    ]).best('store', range, noChannels);
    expect(best.campaign).toEqual({
      id: 'best-return',
      name: 'best-return',
      revenuePoisha: '1000000',
      returnPerTaka: 100,
    });
  });

  it('shows no best campaign when none has 100 people delivered and 3 orders', async () => {
    const best = await service([
      { id: 'small', delivered: 80, costPoisha: 100, orders: 5, revenue: 500_000 },
    ]).best('store', range, noChannels);
    expect(best.campaign).toBeNull();
  });

  it('ranks channels by return and names a different channel that earned more money', async () => {
    const best = await service([]).best('store', range, [
      {
        channel: 'sms',
        sent: 1,
        deliveredPercent: 100,
        costPoisha: '60000',
        revenuePoisha: '5640000',
      },
      {
        channel: 'whatsapp',
        sent: 1,
        deliveredPercent: 100,
        costPoisha: '200000',
        revenuePoisha: '9000000',
      },
      {
        channel: 'messenger',
        sent: 1,
        deliveredPercent: 100,
        costPoisha: '0',
        revenuePoisha: '100',
      },
    ]);
    expect(best.channel).toEqual({ channel: 'sms', returnPerTaka: 94 });
    expect(best.mostMoneyChannel).toEqual({ channel: 'whatsapp', revenuePoisha: '9000000' });
  });

  it('ignores channels that spent less than ৳500 and repeats nothing when one channel wins both', async () => {
    const small = await service([]).best('store', range, [
      {
        channel: 'sms',
        sent: 1,
        deliveredPercent: 100,
        costPoisha: '49999',
        revenuePoisha: '9000000',
      },
    ]);
    expect(small.channel).toBeNull();
    const single = await service([]).best('store', range, [
      {
        channel: 'sms',
        sent: 1,
        deliveredPercent: 100,
        costPoisha: '50000',
        revenuePoisha: '9000000',
      },
    ]);
    expect(single.channel?.channel).toBe('sms');
    expect(single.mostMoneyChannel).toBeNull();
  });

  it('picks the automation with the most money and breaks a tie by return', async () => {
    const best = await service(
      [],
      [
        { id: 'less', costPoisha: 100, orders: 1, revenue: 100_000 },
        { id: 'tie-cheaper', costPoisha: 100, orders: 4, revenue: 400_000 },
        { id: 'tie-dearer', costPoisha: 1_000, orders: 4, revenue: 400_000 },
        { id: 'earned-nothing', costPoisha: 100, orders: 0, revenue: 0 },
      ],
    ).best('store', range, noChannels);
    expect(best.automation).toMatchObject({ id: 'tie-cheaper', returnPerTaka: 4000 });
  });
});
