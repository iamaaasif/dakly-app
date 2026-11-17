import { describe, expect, it } from 'vitest';

import { changeProductSchema, createProductSchema, productListQuerySchema } from './products';

const option = { name: 'Size', values: ['M', 'L'] };
const variant = { optionValues: { Size: 'M' }, priceOverridePoisha: 60000 };

describe('product contracts', () => {
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

  it('bounds lists and rejects unknown readiness filters', () => {
    expect(productListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(productListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ readiness: 'popular' }).success).toBe(false);
  });
});
