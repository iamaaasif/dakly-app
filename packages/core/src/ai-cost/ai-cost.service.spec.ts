import { describe, expect, it, vi } from 'vitest';

import type { StaffAlertsService } from '../admin/staff-alerts.service';
import type { Clock } from '../platform/clock';
import type { AiCostRepository, StoreAiCost } from './ai-cost.repository';
import { AiCostService } from './ai-cost.service';

const ceiling = 5_000_000;
const heavy: StoreAiCost = {
  storeId: '019c01ea-cf15-7d31-a7f5-d73d66007ad7',
  name: 'Rina Shop',
  runs: 900,
  failedRuns: 12,
  costMicroUsd: 6_200_000,
};
const light: StoreAiCost = {
  ...heavy,
  storeId: '019c01ea-cf15-7d31-a7f5-d73d66007ad8',
  costMicroUsd: 400_000,
};

function build(shops: StoreAiCost[], { alerted = false, slack = true } = {}) {
  const costByStore = vi.fn(async (_range: { from: Date; to: Date }, minimum: number) =>
    shops.filter((shop) => shop.costMicroUsd >= minimum),
  );
  const recordAlert = vi.fn(async () => undefined);
  const notify = vi.fn(async () => slack);
  // 21:00 UTC on 20 November is already 21 November in Dhaka.
  const clock = { now: () => new Date('2026-11-20T21:00:00Z') } as Clock;
  const service = new AiCostService(
    { costByStore, hasAlerted: async () => alerted, recordAlert } as unknown as AiCostRepository,
    { notify } as unknown as StaffAlertsService,
    clock,
    ceiling,
  );
  return { service, costByStore, recordAlert, notify };
}

describe('AI cost per shop', () => {
  it('reads the Dhaka day and marks shops at or over the ceiling', async () => {
    const { service, costByStore } = build([heavy, light]);

    const report = await service.report();

    expect(report.day).toBe('2026-11-21');
    expect(report.totalMicroUsd).toBe(6_600_000);
    expect(report.shops.map((shop) => shop.overCeiling)).toEqual([true, false]);
    const range = costByStore.mock.calls[0]![0];
    expect(range.from.toISOString()).toBe('2026-11-20T18:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-11-21T18:00:00.000Z');
  });

  it('alerts staff once for a shop over the ceiling', async () => {
    const first = build([heavy, light]);
    await first.service.alertOverCeiling();
    expect(first.notify).toHaveBeenCalledOnce();
    expect(first.recordAlert).toHaveBeenCalledWith(heavy.storeId, '2026-11-21', heavy.costMicroUsd);

    const repeat = build([heavy], { alerted: true });
    await repeat.service.alertOverCeiling();
    expect(repeat.notify).not.toHaveBeenCalled();
  });

  it('keeps the shop due for an alert while Slack is not configured', async () => {
    const { service, recordAlert } = build([heavy], { slack: false });

    await service.alertOverCeiling();

    expect(recordAlert).not.toHaveBeenCalled();
  });
});
