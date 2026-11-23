import { describe, expect, it } from 'vitest';

import type { ProductsService } from '../products/products.service';
import { orderParcelWeightGrams } from './order-parcel-weight';

const items = [
  { variantId: 'a', quantity: 2 },
  { variantId: 'b', quantity: 1 },
];
const products = (weights: [string, number | null][]) =>
  ({ variantWeights: () => Promise.resolve(new Map(weights)) }) as unknown as ProductsService;

describe('orderParcelWeightGrams', () => {
  it('adds weight times quantity for every item', async () => {
    const weights: [string, number | null][] = [
      ['a', 300],
      ['b', 450],
    ];
    expect(await orderParcelWeightGrams(products(weights), 's', items)).toBe(1050);
  });

  it('is null when any product has no weight', async () => {
    const weights: [string, number | null][] = [
      ['a', 300],
      ['b', null],
    ];
    expect(await orderParcelWeightGrams(products(weights), 's', items)).toBeNull();
  });

  it('is null for an order with no items', async () => {
    expect(await orderParcelWeightGrams(products([]), 's', [])).toBeNull();
  });
});
