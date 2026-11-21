import { describe, expect, it } from 'vitest';

import type { AiChatReportService } from '../messaging/ai-chat-report.service';
import { AnalyticsAiAgentService } from './analytics-ai-agent.service';
import type { AnalyticsService } from './analytics.service';

const period = { from: '2026-11-01', through: '2026-11-30' };
const none = { aiChats: 0, inProgress: 0, answeredByPerson: 0, resolved: 0, handedOver: [] };

function build(now: object, before: object) {
  const results = [now, before];
  const reports = {
    periods: async () => ({
      asOf: 'now',
      timeZone: 'Asia/Dhaka',
      current: period,
      previous: { from: '2026-10-01', through: '2026-10-31' },
    }),
    aiOrders: async () => ({ count: 2, salesPoisha: 150000n }),
    aiCostPoisha: async () => 2500n,
  } as unknown as AnalyticsService;
  const chats = { chats: async () => results.shift() } as unknown as AiChatReportService;
  return new AnalyticsAiAgentService(reports, chats);
}

describe('AI agent report', () => {
  it('leaves chats still inside 24 hours out of the resolution rate', async () => {
    const report = await build(
      {
        aiChats: 10,
        inProgress: 2,
        answeredByPerson: 1,
        resolved: 6,
        handedOver: [
          { reason: 'discount', chats: 1 },
          { reason: 'refund', chats: 3 },
        ],
      },
      none,
    ).aiAgent('store', { period: 30 });
    expect(report.resolutionPercent).toEqual({ current: 75, previous: null });
    expect(report.handedOver).toEqual({ current: 4, previous: 0 });
    expect(report.handoverReasons.map(({ reason }) => reason)).toEqual(['refund', 'discount']);
    expect(report.stillOpen).toBe(2);
    expect(report.cost).toEqual({ currentPoisha: '2500', previousPoisha: '2500' });
    expect(report.sales.currentPoisha).toBe('150000');
  });
});
