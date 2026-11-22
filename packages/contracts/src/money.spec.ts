import { describe, expect, it } from 'vitest';

import { formatMoney, poishaToTakaText } from './money';

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

describe('poishaToTakaText', () => {
  it('writes plain taka with two decimals, from numbers, bigints and strings', () => {
    expect(poishaToTakaText(125050)).toBe('1250.50');
    expect(poishaToTakaText(100n)).toBe('1.00');
    expect(poishaToTakaText('5')).toBe('0.05');
    expect(poishaToTakaText(-1234)).toBe('-12.34');
  });
});
