import { describe, expect, it } from 'vitest';

import type { ProductResponse } from '@dakly/contracts/products';

import { hasStockEdits, stockChanges } from './product-stock-changes';

function product(variants: { id: string; title: string; onHand: number; values: object }[]) {
  return {
    variants: variants.map(({ values, ...variant }) => ({ ...variant, optionValues: values })),
  } as unknown as ProductResponse;
}
const options = [{ name: 'Size', values: ['S', 'M'] }];

describe('stock changes on save', () => {
  const before = product([{ id: 'one', title: 'S', onHand: 12, values: { Size: 'S' } }]);

  it('writes the difference for saved rows and the whole number for new ones', () => {
    const rows = [
      { id: 'one', optionValues: { 0: 'S' }, initialStock: 9 },
      { optionValues: { 0: 'M' }, initialStock: 4 },
    ];
    const saved = product([
      { id: 'one', title: 'S', onHand: 12, values: { Size: 'S' } },
      { id: 'two', title: 'M', onHand: 0, values: { Size: 'M' } },
    ]);
    expect(stockChanges(saved, { options, variants: rows }, before)).toEqual([
      { variantId: 'one', label: 'S', quantity: -3 },
      { variantId: 'two', label: 'M', quantity: 4 },
    ]);
    expect(hasStockEdits({ variants: rows }, before)).toBe(true);
  });

  it('writes nothing when stock is unchanged', () => {
    const rows = [{ id: 'one', optionValues: { 0: 'S' }, initialStock: 12 }];
    expect(stockChanges(before, { options, variants: rows }, before)).toEqual([]);
    expect(hasStockEdits({ variants: rows }, before)).toBe(false);
  });

  it('treats the stock of a new product as initial stock', () => {
    const saved = product([{ id: 'x', title: 'Default', onHand: 0, values: {} }]);
    const rows = [{ optionValues: {}, initialStock: 7 }];
    expect(stockChanges(saved, { options: [], variants: rows })).toEqual([
      { variantId: 'x', label: 'Default', quantity: 7 },
    ]);
  });
});
