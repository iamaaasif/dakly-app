import { describe, expect, it } from 'vitest';

import type { ChatProduct } from '../products/products.service';
import { describeAlternatives } from './product-match-results';

const variant = (id: string, available: number) => ({
  id,
  title: id,
  isDefault: false,
  pricePoisha: 65000,
  available,
});

const polo: ChatProduct = {
  id: 'polo',
  name: 'Polo',
  isStockTracked: true,
  stockStatus: 'in_stock',
  description: null,
  category: 'men',
  variants: [variant('M', 5), variant('L', 0), variant('XL', -2)],
};

describe('describeAlternatives', () => {
  it('lists an oversold size as sold out so the customer can wait for it', () => {
    const result = describeAlternatives(polo, [], () => ({})) as {
      inStockSizes: { variantId: string }[];
      soldOutVariants: { variantId: string }[];
    };
    expect(result.inStockSizes.map(({ variantId }) => variantId)).toEqual(['M']);
    expect(result.soldOutVariants.map(({ variantId }) => variantId)).toEqual(['L', 'XL']);
  });

  it('never offers an untracked product the owner marked out of stock', () => {
    const scarf: ChatProduct = {
      ...polo,
      isStockTracked: false,
      stockStatus: 'out_of_stock',
      variants: [variant('One size', 0)],
    };
    const result = describeAlternatives(scarf, [], () => ({})) as {
      inStockSizes: unknown[];
      soldOutVariants: { variantId: string }[];
    };
    expect(result.inStockSizes).toEqual([]);
    expect(result.soldOutVariants.map(({ variantId }) => variantId)).toEqual(['One size']);
  });

  it('does not offer a tracked product with no stock', () => {
    const result = describeAlternatives(
      { ...polo, variants: [variant('M', 0)] },
      [],
      () => ({}),
    ) as { inStockSizes: unknown[] };
    expect(result.inStockSizes).toEqual([]);
  });
});
