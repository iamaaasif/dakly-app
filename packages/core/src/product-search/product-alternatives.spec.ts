import { describe, expect, it } from 'vitest';

import type { ChatProduct } from '../products/products.service';
import { pickAlternatives } from './product-alternatives';

function product(
  id: string,
  category: string | null,
  description: string,
  variants: [price: number, stock: number][],
): ChatProduct {
  return {
    id,
    name: id,
    isStockTracked: true,
    description,
    category,
    variants: variants.map(([pricePoisha, available], index) => ({
      id: `${id}-${index}`,
      title: String(index),
      isDefault: index === 0,
      pricePoisha,
      available,
    })),
  };
}

describe('pickAlternatives', () => {
  const soldOut = product('red-panjabi', 'men', 'red cotton panjabi', [[120000, 0]]);

  it('never offers another category, a sold-out product or the product itself', () => {
    const picked = pickAlternatives(
      soldOut,
      [
        soldOut,
        product('saree', 'women', 'red saree', [[120000, 5]]),
        product('gone', 'men', 'red panjabi', [[120000, 0]]),
        product('blue-panjabi', 'men', 'blue cotton panjabi', [[130000, 4]]),
      ],
      3,
    );
    expect(picked.map(({ id }) => id)).toEqual(['blue-panjabi']);
  });

  it('puts shared words first, then the closest price', () => {
    const picked = pickAlternatives(
      soldOut,
      [
        product('cheap-shirt', 'men', 'plain shirt', [[50000, 9]]),
        product('near-shirt', 'men', 'plain shirt', [[110000, 9]]),
        product('red-shirt', 'men', 'red cotton shirt', [[300000, 9]]),
      ],
      2,
    );
    expect(picked.map(({ id }) => id)).toEqual(['red-shirt', 'near-shirt']);
  });

  it('offers nothing when the product still has a size in stock', () => {
    const sized = product('polo', 'men', 'cotton polo', [
      [65000, 4],
      [65000, 0],
    ]);
    expect(pickAlternatives(sized, [product('shirt', 'men', 'shirt', [[65000, 9]])], 3)).toEqual(
      [],
    );
  });

  it('lists only the sizes with stock and gives nothing when the category is unknown', () => {
    const [alternative] = pickAlternatives(
      soldOut,
      [
        product('mixed', 'men', 'panjabi', [
          [120000, 0],
          [120000, 3],
        ]),
      ],
      3,
    );
    expect(alternative?.variants.map(({ available }) => available)).toEqual([3]);
    expect(pickAlternatives(product('x', null, 'x', [[1, 0]]), [alternative!], 3)).toEqual([]);
  });
});
