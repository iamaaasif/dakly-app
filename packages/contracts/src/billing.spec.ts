import { describe, expect, it } from 'vitest';

import * as billing from './billing';

describe('plan trial length', () => {
  it('allows no trial and whole days through 90', () => {
    for (const days of [0, 14, 90]) {
      expect(billing.planTrialDaysSchema.parse(days)).toBe(days);
    }
    for (const days of [-1, 91, 1.5]) {
      expect(billing.planTrialDaysSchema.safeParse(days).success).toBe(false);
    }
  });
});

describe('coupon duration', () => {
  it('requires months only for a months duration and limits it to 1 through 36', () => {
    for (const input of [
      { duration: 'once', durationMonths: null },
      { duration: 'forever', durationMonths: null },
      { duration: 'months', durationMonths: 1 },
      { duration: 'months', durationMonths: 36 },
    ]) {
      expect(billing.couponDurationSchema.parse(input)).toEqual(input);
    }
    for (const input of [
      { duration: 'months', durationMonths: null },
      { duration: 'months' },
      { duration: 'months', durationMonths: 0 },
      { duration: 'months', durationMonths: 37 },
      { duration: 'months', durationMonths: 1.5 },
      { duration: 'once', durationMonths: 3 },
      { duration: 'forever', durationMonths: 3 },
      { duration: 'days', durationMonths: null },
    ]) {
      expect(billing.couponDurationSchema.safeParse(input).success).toBe(false);
    }
  });
});
