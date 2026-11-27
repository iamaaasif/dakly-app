import { describe, expect, it } from 'vitest';

import { newOrderTotals } from './new-order-totals';

const lines = [
  { quantity: 2, unitPricePoisha: 60_000 },
  { quantity: 1, unitPricePoisha: 45_000 },
];

describe('newOrderTotals', () => {
  it('adds the lines, the delivery charge and takes off the discount and the advance', () => {
    expect(
      newOrderTotals({
        lines,
        discountPoisha: 5_000,
        deliveryPoisha: 6_000,
        advancePoisha: 20_000,
      }),
    ).toEqual({
      subtotalPoisha: 165_000,
      totalPoisha: 166_000,
      cashToCollectPoisha: 146_000,
      discountTooLarge: false,
    });
  });

  it('never asks for less than nothing when the advance covers the total', () => {
    expect(
      newOrderTotals({ lines, discountPoisha: 0, deliveryPoisha: 0, advancePoisha: 999_999 })
        .cashToCollectPoisha,
    ).toBe(0);
  });

  it('flags a discount above the items and ignores it', () => {
    expect(
      newOrderTotals({ lines, discountPoisha: 200_000, deliveryPoisha: 6_000, advancePoisha: 0 }),
    ).toMatchObject({ discountTooLarge: true, totalPoisha: 171_000 });
  });
});
