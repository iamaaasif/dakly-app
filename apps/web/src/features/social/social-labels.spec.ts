import { describe, expect, it } from 'vitest';

import { formatSlotTime } from './social-labels';

describe('formatSlotTime', () => {
  it.each([
    ['00:00', '12:00 am'],
    ['08:30', '8:30 am'],
    ['12:30', '12:30 pm'],
    ['20:30', '8:30 pm'],
  ])('shows %s as %s', (time, expected) => {
    expect(formatSlotTime(time)).toBe(expected);
  });
});
