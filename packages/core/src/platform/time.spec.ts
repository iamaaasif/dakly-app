import { describe, expect, it } from 'vitest';

import { startOfDayIn } from './time';

describe('startOfDayIn', () => {
  it('returns local midnight for the shop, not for UTC', () => {
    // 20:30 UTC on 21 November is 02:30 on 22 November in Dhaka (UTC+6).
    const now = new Date('2026-11-21T20:30:15.250Z');
    expect(startOfDayIn('Asia/Dhaka', now).toISOString()).toBe('2026-11-21T18:00:00.000Z');
    expect(startOfDayIn('UTC', now).toISOString()).toBe('2026-11-21T00:00:00.000Z');
  });
});
