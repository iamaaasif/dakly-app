import { describe, expect, it } from 'vitest';

import { applyProductBulkEditSchema, productBulkEditFormSchema } from './product-bulk-edits';

const productId = '019c01ea-cf15-7d31-a7f5-d73d66007a01';

describe('applyProductBulkEditSchema', () => {
  it('needs a reason when stock changes', () => {
    const result = applyProductBulkEditSchema.safeParse({ rows: [{ productId, stock: 5 }] });
    expect(result.error?.issues[0]?.path).toEqual(['stockReason']);
  });

  it('refuses a row with nothing to change and a product listed twice', () => {
    expect(applyProductBulkEditSchema.safeParse({ rows: [{ productId }] }).success).toBe(false);
    const twice = { productId, pricePoisha: 100 };
    expect(applyProductBulkEditSchema.safeParse({ rows: [twice, twice] }).success).toBe(false);
  });
});

describe('productBulkEditFormSchema', () => {
  it('turns a blank cell into no change and Taka into poisha', () => {
    const result = productBulkEditFormSchema.parse({
      stockReason: '',
      rows: [
        {
          productId,
          pricePoisha: '1250.5',
          compareAtPricePoisha: '',
          costPoisha: '',
          stock: '',
          category: '  ',
          status: 'active',
        },
      ],
    });
    expect(result.rows[0]).toEqual({
      productId,
      pricePoisha: 125050,
      compareAtPricePoisha: undefined,
      costPoisha: undefined,
      stock: undefined,
      category: undefined,
      status: 'active',
    });
  });

  it('rejects a zero price and a stock that is not a whole number', () => {
    const row = {
      productId,
      compareAtPricePoisha: '',
      costPoisha: '',
      category: '',
      status: 'active',
    };
    const parse = (cells: object) =>
      productBulkEditFormSchema.safeParse({
        stockReason: '',
        rows: [{ ...row, pricePoisha: '10', stock: '', ...cells }],
      }).success;
    expect(parse({})).toBe(true);
    expect(parse({ pricePoisha: '0' })).toBe(false);
    expect(parse({ stock: '1.5' })).toBe(false);
  });
});
