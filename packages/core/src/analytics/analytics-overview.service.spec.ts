import { describe, expect, it } from 'vitest';

import type { AutomationsService } from '../automations/automations.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import { AnalyticsOverviewService } from './analytics-overview.service';
import type { AnalyticsService } from './analytics.service';

const current = { from: '2026-11-01', through: '2026-11-14' };
const previous = { from: '2026-10-18', through: '2026-10-31' };
const point = (day: string, value: bigint) => ({ day, value });

function overview(totals: { campaigns: object[]; automations: object[]; previous?: object[] }) {
  const reports = {
    periods: async () => ({
      asOf: '2026-11-14T06:00:00.000Z',
      timeZone: 'Asia/Dhaka',
      current,
      previous,
    }),
    marketingRevenue: async (_: string, period: typeof current) => ({
      total: period === current ? 100_000n : 80_000n,
      points: [point('2026-11-01', 100_000n)],
    }),
    marketingOrders: async (_: string, period: typeof current) => ({
      total: period === current ? 7n : 5n,
      points: [],
    }),
    messagePeople: async (_: string, period: typeof current) =>
      period === current ? { delivered: 120, tapped: 14 } : { delivered: 80, tapped: 8 },
    marketingRevenueByChannel: async () => [
      { day: '2026-11-01', channel: 'sms', value: 60_000n },
      { day: '2026-11-09', channel: 'sms', value: 10_000n },
      { day: '2026-11-09', channel: 'whatsapp', value: 30_000n },
      { day: '2026-11-09', channel: 'unknown', value: 1n },
    ],
  } as unknown as AnalyticsService;
  const messages = (rows: object[], before?: object[]) => ({
    messageTotals: async (_: string, period: typeof current) =>
      period.from === current.from ? rows : (before ?? []),
  });
  return new AnalyticsOverviewService(
    reports,
    messages(totals.campaigns, totals.previous) as unknown as CampaignsService,
    messages(totals.automations) as unknown as AutomationsService,
  ).overview('store', { period: 14 as 30 });
}

describe('analytics overview', () => {
  it('adds campaigns and workflows and measures reads on channels that report them', async () => {
    const result = await overview({
      campaigns: [
        { channel: 'sms', sent: 100, delivered: 90, read: 0, costPoisha: '3500' },
        { channel: 'whatsapp', sent: 50, delivered: 40, read: 20, costPoisha: '4750' },
      ],
      automations: [{ channel: 'sms', sent: 10, delivered: 10, read: 0, costPoisha: '350' }],
      previous: [{ channel: 'sms', sent: 80, delivered: 80, read: 0, costPoisha: '2800' }],
    });

    expect(result.messages).toMatchObject({
      sent: { current: 160, previous: 80 },
      deliveredPercent: 87.5,
      tappedPeople: { current: 14, previous: 8 },
      tapPercent: 11.7,
      cost: { currentPoisha: '8600', previousPoisha: '2800' },
    });
    expect(result.returnPerTaka).toBe(12);
    expect(result.funnel).toEqual({
      sent: { count: 160, percentOfPrevious: null },
      delivered: { count: 140, percentOfPrevious: 87.5 },
      read: { count: 20, percentOfPrevious: 50 },
      tapped: { count: 14, percentOfPrevious: 11.7 },
      ordered: { count: 7, percentOfPrevious: 50 },
    });
    expect(result.marketing.orders).toEqual({ current: 7, previous: 5 });
  });

  it('puts channel money in weekly buckets and skips channels it cannot name', async () => {
    const result = await overview({ campaigns: [], automations: [] });

    expect(result.weeklyRevenue).toEqual([
      { weekStart: '2026-11-01', byChannel: { sms: '60000' } },
      { weekStart: '2026-11-08', byChannel: { sms: '10000', whatsapp: '30000' } },
    ]);
  });

  it('hides the return per ৳1 when nothing was spent', async () => {
    const result = await overview({ campaigns: [], automations: [] });

    expect(result.returnPerTaka).toBeNull();
    expect(result.messages.deliveredPercent).toBeNull();
  });
});
