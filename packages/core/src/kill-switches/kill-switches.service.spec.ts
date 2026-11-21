import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../platform/clock';
import type { KillSwitchesRepository, KillSwitchRow } from './kill-switches.repository';
import { KILL_SWITCH_RECHECK_MS, KillSwitchesService } from './kill-switches.service';

const shop = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const otherShop = '019c01ea-cf15-7d31-a7f5-d73d66007ad8';

function row(feature: KillSwitchRow['feature'], storeId: string | null): KillSwitchRow {
  return {
    id: crypto.randomUUID(),
    feature,
    storeId,
    reason: 'Provider outage under investigation',
    pausedByStaffId: crypto.randomUUID(),
    createdAt: new Date(),
  };
}

function build(rows: KillSwitchRow[]) {
  let now = new Date('2026-11-21T10:00:00Z').getTime();
  const list = vi.fn(async () => rows);
  const service = new KillSwitchesService(
    { list } as unknown as KillSwitchesRepository,
    {
      now: () => new Date(now),
    } as Clock,
  );
  return { service, list, advance: (ms: number) => (now += ms) };
}

describe('kill switches', () => {
  it('pauses every shop for a global switch and only that shop for a shop switch', async () => {
    const { service } = build([row('ai_replies', null), row('campaign_sending', shop)]);

    expect(await service.isPaused('ai_replies', otherShop)).toBe(true);
    expect(await service.isPaused('campaign_sending', shop)).toBe(true);
    expect(await service.isPaused('campaign_sending', otherShop)).toBe(false);
    expect(await service.isPaused('social_posting', shop)).toBe(false);
  });

  it('asks a paused job to wait a minute and lets a running feature through', async () => {
    const { service } = build([row('social_posting', null)]);

    expect(await service.deferIfPaused('social_posting', shop)).toEqual({
      delayUntil: new Date('2026-11-21T10:00:00Z').getTime() + KILL_SWITCH_RECHECK_MS,
    });
    expect(await service.deferIfPaused('ai_replies', shop)).toBeUndefined();
  });

  it('reads the table again after the cache expires', async () => {
    const { service, list, advance } = build([]);

    await service.isPaused('ai_replies', shop);
    advance(29_000);
    await service.isPaused('ai_replies', shop);
    expect(list).toHaveBeenCalledTimes(1);
    advance(2_000);
    await service.isPaused('ai_replies', shop);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
