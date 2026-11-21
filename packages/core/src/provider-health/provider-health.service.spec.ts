import { describe, expect, it } from 'vitest';

import type { Clock } from '../platform/clock';
import type { ProviderHealthRepository, ProviderSpanRow } from './provider-health.repository';
import { ProviderHealthService } from './provider-health.service';

describe('provider health', () => {
  it('joins the hour and day counts of each provider in name order', async () => {
    const rows: ProviderSpanRow[] = [
      { provider: 'sms', span: 'day', attempts: 400, failures: 8, averageLatencyMs: null },
      { provider: 'ai:fast', span: 'hour', attempts: 50, failures: 5, averageLatencyMs: 900 },
      { provider: 'ai:fast', span: 'day', attempts: 700, failures: 10, averageLatencyMs: 880 },
    ];
    const service = new ProviderHealthService(
      { spans: async () => rows } as unknown as ProviderHealthRepository,
      { now: () => new Date('2026-11-21T10:00:00Z') } as Clock,
    );

    const report = await service.report();

    expect(report.providers).toEqual([
      {
        provider: 'ai:fast',
        hourAttempts: 50,
        hourFailures: 5,
        dayAttempts: 700,
        dayFailures: 10,
        averageLatencyMsLastHour: 900,
      },
      {
        provider: 'sms',
        hourAttempts: 0,
        hourFailures: 0,
        dayAttempts: 400,
        dayFailures: 8,
        averageLatencyMsLastHour: null,
      },
    ]);
  });
});
