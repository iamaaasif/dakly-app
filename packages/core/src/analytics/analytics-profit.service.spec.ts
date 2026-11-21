import { describe, expect, it } from 'vitest';

import type { AutomationsService } from '../automations/automations.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import { AnalyticsProfitService } from './analytics-profit.service';
import type { AnalyticsService } from './analytics.service';

function build(inputs: object[], messageCostPoisha: number) {
  const queue = [...inputs];
  const reports = {
    periods: async () => ({
      asOf: 'now',
      timeZone: 'Asia/Dhaka',
      current: { from: '2026-11-01', through: '2026-11-30' },
      previous: { from: '2026-10-01', through: '2026-10-31' },
    }),
    marketingProfitInputs: async () => queue.shift(),
  } as unknown as AnalyticsService;
  const messages = [
    {
      channel: 'sms',
      sent: 1,
      delivered: 1,
      read: 0,
      costPoisha: messageCostPoisha,
    },
  ];
  const campaigns = { messageTotals: async () => messages } as unknown as CampaignsService;
  const automations = { messageTotals: async () => [] } as unknown as AutomationsService;
  return new AnalyticsProfitService(reports, campaigns, automations);
}

describe('profit report', () => {
  it('takes product, delivery and message cost from money from marketing and can go negative', async () => {
    const report = await build(
      [
        {
          counted: 3,
          excluded: 2,
          revenuePoisha: 100000n,
          productCostPoisha: 60000n,
          deliveryCostPoisha: 15000n,
        },
        {
          counted: 1,
          excluded: 0,
          revenuePoisha: 20000n,
          productCostPoisha: 30000n,
          deliveryCostPoisha: 0n,
        },
      ],
      5000,
    ).profit('store', { period: 30 });
    expect(report.profit.currentPoisha).toBe('20000');
    expect(report.profit.previousPoisha).toBe('-15000');
    expect(report.excludedOrders).toEqual({ current: 2, previous: 0 });
    expect(report.returnPerTaka.current).toBe(4);
  });
});
