import { describe, expect, it } from 'vitest';

import type { OrderCatalogueProduct } from '@dakly/contracts/orders';

import { addLine, clampQuantity, lineFromVariant, type OrderLine } from './new-order-lines';

const product = (stock: number, tracked = true): OrderCatalogueProduct => ({
  id: 'p1',
  name: 'Panjabi',
  isStockTracked: tracked,
  stockStatus: 'in_stock',
  variants: [
    {
      id: 'm',
      title: 'M',
      isDefault: false,
      pricePoisha: 125_000,
      available: stock,
      photoUrl: null,
    },
    { id: 'free', title: 'Free', isDefault: false, pricePoisha: 0, available: 5, photoUrl: null },
  ],
});

describe('order lines', () => {
  it('takes the price and stock of the variant from the catalogue', () => {
    expect(lineFromVariant(product(3), 'm')).toMatchObject({
      variantId: 'm',
      variantTitle: 'M',
      unitPricePoisha: 125_000,
      available: 3,
      quantity: 1,
    });
  });

  it('never makes a line for a variant with no price', () => {
    expect(lineFromVariant(product(3), 'free')).toBeUndefined();
  });

  it('does not limit a product that does not track stock', () => {
    const line = lineFromVariant(product(0, false), 'm')!;
    expect(line.available).toBeNull();
    expect(clampQuantity(line, 500)).toBe(500);
  });

  it('refuses an out of stock variant', () => {
    const line = lineFromVariant(product(0), 'm')!;
    expect(addLine([], line)).toEqual({ lines: [], stopped: 'out_of_stock' });
  });

  it('adds one more of a variant already in the order, up to the stock', () => {
    const line: OrderLine = lineFromVariant(product(2), 'm')!;
    const once = addLine([], line).lines;
    const twice = addLine(once, line);
    expect(twice.lines[0]?.quantity).toBe(2);
    expect(addLine(twice.lines, line)).toMatchObject({ stopped: 'stock_limit' });
  });

  it('stops a typed quantity at the stock and never below one', () => {
    const line = lineFromVariant(product(4), 'm')!;
    expect(clampQuantity(line, 9)).toBe(4);
    expect(clampQuantity(line, 0)).toBe(1);
    expect(clampQuantity(line, 2.7)).toBe(2);
  });
});
