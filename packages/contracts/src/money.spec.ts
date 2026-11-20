import { describe, expect, it } from 'vitest';

import { formatMoney } from './money';

describe('formatMoney', () => {
  it.each([
    [126000, '৳1,260'],
    [123456700, '৳12,34,567'],
    [123450, '৳1,234.50'],
    [99, '৳0.99'],
    [-125050, '-৳1,250.50'],
  ])('writes %i poisha as %s', (poisha, expected) => {
    expect(formatMoney(poisha)).toBe(expected);
  });

  it('refuses a fractional amount of poisha', () => {
    expect(() => formatMoney(1.5)).toThrow(RangeError);
  });
});
