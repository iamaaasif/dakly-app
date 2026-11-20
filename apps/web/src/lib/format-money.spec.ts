import { describe, expect, it } from 'vitest';

import { formatMoney } from '@dakly/contracts/money';

import { formatWholeTaka, takaInputFromPoisha } from './format-money';

describe('formatMoney', () => {
  it.each([
    [0, '৳0'],
    [-0, '৳0'],
    [1, '৳0.01'],
    [99, '৳0.99'],
    [100, '৳1'],
    [125050, '৳1,250.50'],
    [99999, '৳999.99'],
    [100000, '৳1,000'],
    [9999999, '৳99,999.99'],
    [10000000, '৳1,00,000'],
    [34280000, '৳3,42,800'],
    [-1, '-৳0.01'],
    [-125050, '-৳1,250.50'],
    [-10000000, '-৳1,00,000'],
    [Number.MAX_SAFE_INTEGER, '৳9,00,71,99,25,47,409.91'],
    [-Number.MAX_SAFE_INTEGER, '-৳9,00,71,99,25,47,409.91'],
    [Number.MAX_SAFE_INTEGER - 1, '৳9,00,71,99,25,47,409.90'],
  ])('formats %s poisha as %s', (amount, expected) => {
    expect(formatMoney(amount)).toBe(expected);
  });

  it.each([NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid poisha %s rather than displaying zero',
    (amount) => {
      expect(() => formatMoney(amount)).toThrow(RangeError);
    },
  );
});

describe('formatWholeTaka', () => {
  it.each([
    [41893149n, '৳4,18,931'],
    [41893150n, '৳4,18,932'],
    [-41893150n, '-৳4,18,932'],
  ])('rounds %s poisha to %s', (amount, expected) => {
    expect(formatWholeTaka(amount)).toBe(expected);
  });
});

describe('takaInputFromPoisha', () => {
  it('keeps the exact poisha for a supported amount that floating division rounds', () => {
    expect(takaInputFromPoisha(7036874417766401)).toBe('70368744177664.01');
  });
});
