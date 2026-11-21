import { describe, expect, it } from 'vitest';

import type { Clock } from '../platform/clock';
import type { AiRateRepository } from './ai-rate.repository';
import { AiRateService } from './ai-rate.service';

const clock = { now: () => new Date('2026-11-21T10:00:00Z') } as Clock;

function build(stored: unknown) {
  const repository = {
    read: async () =>
      stored ? { value: stored, updatedAt: new Date('2026-11-01T00:00:00Z') } : undefined,
  } as unknown as AiRateRepository;
  return new AiRateService(repository, clock);
}

describe('AI rate', () => {
  it('uses the platform default of ৳122 until staff set one', async () => {
    const service = build(undefined);
    expect(await service.current()).toEqual({ poishaPerUsd: 12200, isSet: false, updatedAt: null });
    // $0.005 is 61 poisha at ৳122 per dollar.
    expect(await service.toPoisha(5000)).toBe(61);
  });

  it('uses the staff rate and rounds to the nearest poisha', async () => {
    const service = build({ poishaPerUsd: 12550 });
    expect((await service.current()).isSet).toBe(true);
    expect(await service.toPoisha(1_000_000)).toBe(12550);
    expect(await service.toPoisha(39)).toBe(0);
    expect(await service.toPoisha(40)).toBe(1);
  });

  it('falls back to the default when the stored value is malformed', async () => {
    expect((await build({ poishaPerUsd: 'x' }).current()).poishaPerUsd).toBe(12200);
  });
});
