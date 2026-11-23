import { describe, expect, it } from 'vitest';

import { parcelWeightGrams } from './order-parcel-weight';

describe('parcelWeightGrams', () => {
  const items = [
    { variantId: 'a', quantity: 2 },
    { variantId: 'b', quantity: 1 },
  ];

  it('adds weight times quantity for every item', () => {
    expect(
      parcelWeightGrams(
        items,
        new Map([
          ['a', 300],
          ['b', 450],
        ]),
      ),
    ).toBe(1050);
  });

  it('is null when any product has no weight', () => {
    expect(
      parcelWeightGrams(
        items,
        new Map([
          ['a', 300],
          ['b', null],
        ]),
      ),
    ).toBeNull();
  });

  it('is null for an order with no items', () => {
    expect(parcelWeightGrams([], new Map())).toBeNull();
  });
});
