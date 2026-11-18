import { describe, expect, it } from 'vitest';

import { changeProductSchema, productFormSchema } from './products';

const variantId = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
const input = {
  name: 'Cotton Panjabi',
  pricePoisha: '2450.50',
  compareAtPricePoisha: '',
  options: [{ name: 'Size', values: ['M'] }],
  variants: [
    {
      id: variantId,
      optionValues: { Size: 'M' },
      priceOverridePoisha: '',
      costPoisha: '1250.75',
    },
  ],
  status: 'hidden',
};

describe('product form', () => {
  it('converts submitted Taka once and keeps existing variant ids for the update contract', () => {
    const parsed = productFormSchema.parse(input);
    expect(parsed.pricePoisha).toBe(245050);
    expect(parsed.compareAtPricePoisha).toBeNull();
    expect(parsed.variants[0]).toMatchObject({
      id: variantId,
      priceOverridePoisha: null,
      costPoisha: 125075,
    });
    expect(changeProductSchema.parse(parsed)).toEqual(parsed);
  });

  it('allows a zero base price but rejects a zero override', () => {
    expect(productFormSchema.parse({ ...input, pricePoisha: '0' }).pricePoisha).toBe(0);
    expect(
      productFormSchema.safeParse({
        ...input,
        variants: [{ ...input.variants[0], priceOverridePoisha: '0' }],
      }).success,
    ).toBe(false);
  });

  it.each(['', '-1', 'NaN', '1e3', '12.345', '90071992547409.92'])(
    'rejects invalid or unsafe Taka input %s',
    (pricePoisha) => {
      expect(productFormSchema.safeParse({ ...input, pricePoisha }).success).toBe(false);
    },
  );

  it('keeps the API rules for matching distinct option combinations', () => {
    expect(
      productFormSchema.safeParse({
        ...input,
        variants: [{ ...input.variants[0], optionValues: { Size: 'XL' } }],
      }).success,
    ).toBe(false);
    expect(
      productFormSchema.safeParse({ ...input, variants: [input.variants[0], input.variants[0]] })
        .success,
    ).toBe(false);
  });
});
