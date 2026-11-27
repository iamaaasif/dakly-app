import { describe, expect, it } from 'vitest';

import { guessProductImportMapping } from './product-import-fields';

describe('guessProductImportMapping', () => {
  it('matches common column names once each and turns Size and Colour into options', () => {
    expect(
      guessProductImportMapping([
        'Product Name',
        'Selling Price',
        'SKU',
        'Stock',
        'Size',
        'Colour',
        ' Brand ',
      ]),
    ).toEqual({
      name: 0,
      price: 1,
      sku: 2,
      onHand: 3,
      brand: 6,
      options: [
        { name: 'Size', column: 4 },
        { name: 'Colour', column: 5 },
      ],
    });
  });

  it('leaves a column it cannot place unmapped', () => {
    expect(guessProductImportMapping(['Item', 'Taka'])).toEqual({ options: [] });
  });
});
