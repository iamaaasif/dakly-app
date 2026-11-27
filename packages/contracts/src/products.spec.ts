import { describe, expect, it } from 'vitest';

import { isInStock } from './product-editor-fields';
import {
  changeProductSchema,
  createProductSchema,
  productFormSchema,
  productNegotiationIssue,
  productListQuerySchema,
  stockAdjustmentSchema,
} from './products';

const option = { name: 'Size', values: ['M', 'L'] };
const variant = { optionValues: { Size: 'M' }, priceOverridePoisha: 60000 };

describe('product contracts', () => {
  it('defaults negotiation off and its prices to null on create', () => {
    expect(createProductSchema.parse({ name: 'Panjabi' })).toMatchObject({
      negotiationEnabled: false,
      negotiationOpeningPoisha: null,
      negotiationFloorPoisha: null,
    });
  });

  it('parses negotiation prices as poisha and preserves omitted settings on PATCH', () => {
    expect(changeProductSchema.parse({ negotiationFloorPoisha: 105050 })).toEqual({
      negotiationFloorPoisha: 105050,
    });
    expect(changeProductSchema.safeParse({ negotiationOpeningPoisha: 1250.5 }).success).toBe(false);
    expect(
      productFormSchema.parse({ name: 'Panjabi', negotiationOpeningPoisha: '1250.50' }),
    ).toMatchObject({ negotiationOpeningPoisha: 125050 });
  });

  it.each([
    [{ negotiationOpeningPoisha: null }, 'PRODUCT_NEGOTIATION_OPENING_PRICE'],
    [{ negotiationFloorPoisha: null }, 'PRODUCT_NEGOTIATION_FLOOR_PRICE'],
    [{ negotiationFloorPoisha: 185000 }, 'PRODUCT_NEGOTIATION_FLOOR_PRICE'],
    [{ negotiationFloorPoisha: 180000 }, undefined],
    [{ variants: [{ priceOverridePoisha: 190000 }] }, 'PRODUCT_NEGOTIATION_VARIANT_PRICE'],
    [{ negotiationEnabled: false, negotiationOpeningPoisha: null }, undefined],
  ])(
    'checks negotiation settings against the current selling price and variants: %j',
    (change, code) => {
      const input = createProductSchema.parse({
        name: 'Panjabi',
        pricePoisha: 200000,
        negotiationEnabled: true,
        negotiationOpeningPoisha: 180000,
        negotiationFloorPoisha: 160000,
        variants: [{ costPoisha: 190000 }],
        ...change,
      });
      expect(productNegotiationIssue(input)).toBe(code);
    },
  );

  it('accepts no options and integer poisha, with a positive override', () => {
    expect(createProductSchema.parse({ name: ' পাঞ্জাবি ', pricePoisha: 125050 })).toMatchObject({
      name: 'পাঞ্জাবি',
      pricePoisha: 125050,
      options: [],
      variants: [],
      aliases: [],
    });
    expect(
      createProductSchema.safeParse({ name: 'পাঞ্জাবি', options: [option], variants: [variant] })
        .success,
    ).toBe(true);
  });

  it.each([
    { pricePoisha: -1 },
    { pricePoisha: 1.5 },
    { pricePoisha: Number.MAX_SAFE_INTEGER + 1 },
    { storeId: 'outside-session' },
    { aliases: 'kurti' },
    { options: [option, option, option, option] },
    { options: [option, option], variants: [variant] },
    { options: [{ name: 'Size', values: ['M', 'M'] }], variants: [variant] },
    { options: [option], variants: [] },
    { options: [option], variants: [variant, variant] },
    { options: [option], variants: [{ optionValues: { Size: 'XL' } }] },
    { variants: [variant] },
    { variants: [{}, {}] },
    { variants: [{ onHand: 5 }] },
  ])('rejects inconsistent or unowned product fields: %j', (change) => {
    expect(createProductSchema.safeParse({ name: 'পাঞ্জাবি', ...change }).success).toBe(false);
  });

  it('accepts variant ids only on edits and rejects zero overrides', () => {
    const id = '019c01ea-cf15-7d31-a7f5-d73d66007ae2';
    expect(createProductSchema.safeParse({ name: 'পাঞ্জাবি', variants: [{ id }] }).success).toBe(
      false,
    );
    expect(
      createProductSchema.safeParse({ name: 'পাঞ্জাবি', variants: [{ priceOverridePoisha: 0 }] })
        .success,
    ).toBe(false);
    expect(changeProductSchema.parse({ options: [], variants: [{ id }] }).variants?.[0]?.id).toBe(
      id,
    );
  });

  it('keeps omitted PATCH fields absent and requires option changes with variants', () => {
    expect(changeProductSchema.parse({ name: 'New name' })).toEqual({ name: 'New name' });
    expect(changeProductSchema.safeParse({}).success).toBe(false);
    expect(changeProductSchema.safeParse({ options: [] }).success).toBe(false);
    expect(changeProductSchema.safeParse({ variants: [] }).success).toBe(false);
  });

  it('accepts signed stock corrections and rejects zero or fractional quantities', () => {
    expect(stockAdjustmentSchema.parse({ quantity: -2, reason: 'Count correction' })).toEqual({
      quantity: -2,
      reason: 'Count correction',
    });
    for (const quantity of [0, 0.5, 2147483648])
      expect(
        stockAdjustmentSchema.safeParse({ quantity, reason: 'Count correction' }).success,
      ).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ quantity: 1, reason: '' }).success).toBe(false);
  });

  it('explains invalid fields in plain words', () => {
    const messages = (result: { error?: { issues: { message: string }[] } }) =>
      result.error?.issues.map((issue) => issue.message);
    expect(messages(stockAdjustmentSchema.safeParse({ quantity: 2, reason: '' }))).toEqual([
      'Enter a reason',
    ]);
    expect(
      messages(stockAdjustmentSchema.safeParse({ quantity: Number.NaN, reason: 'x' })),
    ).toEqual(['Enter how many to add or remove']);
    expect(messages(createProductSchema.safeParse({ name: ' ' }))).toEqual([
      'Enter a product name',
    ]);
    expect(messages(productFormSchema.safeParse({ name: 'Shirt', pricePoisha: 'abc' }))).toEqual([
      'Enter Taka with at most two decimal places',
    ]);
  });

  it('bounds lists and rejects unknown readiness filters', () => {
    expect(productListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(productListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ readiness: 'popular' }).success).toBe(false);
  });

  it('keeps editor fields when a PATCH leaves them out', () => {
    expect(changeProductSchema.parse({ barcode: '8901234567890' })).toEqual({
      barcode: '8901234567890',
    });
    expect(createProductSchema.parse({ name: 'Scarf' })).toMatchObject({
      stockStatus: 'in_stock',
    });
  });

  it('accepts a swatch colour only for a listed value', () => {
    const colours = (colors: Record<string, string>) =>
      createProductSchema.safeParse({
        name: 'Scarf',
        options: [{ name: 'Colour', values: ['Red', 'Blue'], colors }],
        variants: [{ optionValues: { Colour: 'Red' } }, { optionValues: { Colour: 'Blue' } }],
      }).success;
    expect(colours({ Red: '#D32F2F' })).toBe(true);
    expect(colours({ Green: '#00FF00' })).toBe(false);
    expect(colours({ Red: 'red' })).toBe(false);
  });

  it('offers a product to customers by its count when tracked and by its status when not', () => {
    expect(isInStock({ isStockTracked: true, stockStatus: 'in_stock' }, 0)).toBe(false);
    expect(isInStock({ isStockTracked: true, stockStatus: 'out_of_stock' }, 2)).toBe(true);
    expect(isInStock({ isStockTracked: false, stockStatus: 'out_of_stock' }, 9)).toBe(false);
    expect(isInStock({ isStockTracked: false, stockStatus: 'in_stock' }, 0)).toBe(true);
  });
});
