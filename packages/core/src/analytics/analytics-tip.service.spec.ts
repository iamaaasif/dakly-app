import { describe, expect, it } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { AutomationsService } from '../automations/automations.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { ValkeyClient } from '../platform/cache/valkey-client';
import { AnalyticsTipService } from './analytics-tip.service';
import type { AnalyticsService } from './analytics.service';

type Window = { from: string; through: string };

// The 30-day window starts on 2026-11-01; the weekly baseline windows are seven days long.
function service(options: {
  now: { sent: number; delivered: number; tapped: number };
  usual: { sent: number; delivered: number; tapped: number };
  ai?: AiService['run'];
  store?: Map<string, string>;
}) {
  const store = options.store ?? new Map<string, string>();
  const cache = {
    connection: {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => void store.set(key, value),
    },
  } as unknown as ValkeyClient;
  const pick = ({ from }: Window) => (from === '2026-11-01' ? options.now : options.usual);
  const reports = {
    periods: async () => ({
      timeZone: 'Asia/Dhaka',
      current: { from: '2026-11-01', through: '2026-11-30' },
    }),
    messagePeople: async (_store: string, window: Window) => {
      const { delivered, tapped } = pick(window);
      return { delivered, tapped };
    },
    marketingOrders: async () => ({ total: 0n }),
  } as unknown as AnalyticsService;
  const campaigns = {
    messageTotals: async (_store: string, window: Window) => {
      const { sent, delivered } = pick(window);
      return [{ channel: 'sms', sent, delivered, read: 0, costPoisha: '0' }];
    },
  } as unknown as CampaignsService;
  const automations = { messageTotals: async () => [] } as unknown as AutomationsService;
  const ai = {
    run:
      options.ai ?? (async () => ({ kind: 'output', output: { suggestion: 'Send one button.' } })),
  } as unknown as AiService;
  return new AnalyticsTipService(reports, campaigns, automations, ai, cache);
}

describe('analytics tip', () => {
  it('names the step that dropped furthest below the store’s usual and adds one fix', async () => {
    const { tip } = await service({
      now: { sent: 100, delivered: 90, tapped: 18 },
      usual: { sent: 100, delivered: 90, tapped: 36 },
    }).tip('store', { period: 30 });
    expect(tip).toEqual({
      step: 'tapped',
      currentPercent: 20,
      usualPercent: 40,
      suggestion: 'Send one button.',
    });
  });

  it('gives no tip when nothing is meaningfully below the usual', async () => {
    const { tip } = await service({
      now: { sent: 100, delivered: 88, tapped: 35 },
      usual: { sent: 100, delivered: 90, tapped: 36 },
    }).tip('store', { period: 30 });
    expect(tip).toBeNull();
  });

  it('gives no tip when the store has no usual to compare with', async () => {
    const { tip } = await service({
      now: { sent: 100, delivered: 90, tapped: 18 },
      usual: { sent: 0, delivered: 0, tapped: 0 },
    }).tip('store', { period: 30 });
    expect(tip).toBeNull();
  });

  it('still shows the drop when the model is unavailable', async () => {
    const { tip } = await service({
      now: { sent: 100, delivered: 90, tapped: 18 },
      usual: { sent: 100, delivered: 90, tapped: 36 },
      ai: async () => ({ kind: 'failure', code: 'AI_PAUSED' }),
    }).tip('store', { period: 30 });
    expect(tip).toMatchObject({ step: 'tapped', suggestion: null });
  });

  it('computes once a day: the second read makes no model call', async () => {
    const store = new Map<string, string>();
    let calls = 0;
    const options = {
      now: { sent: 100, delivered: 90, tapped: 18 },
      usual: { sent: 100, delivered: 90, tapped: 36 },
      store,
      ai: (async () => {
        calls += 1;
        return { kind: 'output', output: { suggestion: 'Send one button.' } };
      }) as unknown as AiService['run'],
    };
    const first = await service(options).tip('store', { period: 30 });
    const second = await service(options).tip('store', { period: 30 });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });
});
