import { describe, expect, it } from 'vitest';

import type { ChatProduct } from '../products/products.service';
import { pickAddOns } from './product-add-ons';

function product(
  id: string,
  category: string | null,
  variants: [price: number, stock: number][],
): ChatProduct {
  return {
    id,
    name: id,
    isStockTracked: true,
    description: null,
    category,
    variants: variants.map(([pricePoisha, available], index) => ({
      id: `${id}-${index}`,
      title: String(index),
      isDefault: index === 0,
      pricePoisha,
      available,
    })),
  } as ChatProduct;
}

describe('pickAddOns', () => {
  const kurti = product('kurti', 'women', [[145000, 5]]);

  it('offers in-stock products of the same category, cheapest first, at most the limit', () => {
    const picked = pickAddOns(
      [kurti],
      [
        product('saree', 'women', [[280000, 5]]),
        product('scarf', 'women', [[40000, 9]]),
        product('three-piece', 'women', [[220000, 7]]),
      ],
      145000,
      2,
    );
    expect(picked.map(({ id }) => id)).toEqual(['scarf', 'three-piece']);
  });

  it('never offers the ordered product, a sold-out product, another category or an unpriced-for-band item', () => {
    const picked = pickAddOns(
      [kurti],
      [
        kurti,
        product('gone', 'women', [[50000, 0]]),
        product('panjabi', 'men', [[50000, 5]]),
        product('uncategorised', null, [[50000, 5]]),
        product('gold-saree', 'women', [[900000, 5]]),
      ],
      145000,
      2,
    );
    expect(picked).toEqual([]);
  });

  it('shows only the sizes that have stock and their own price', () => {
    const [bag] = pickAddOns(
      [kurti],
      [
        product('bag', 'women', [
          [180000, 0],
          [190000, 3],
        ]),
      ],
      145000,
      2,
    );
    expect(bag!.variants.map(({ pricePoisha }) => pricePoisha)).toEqual([190000]);
  });
});
