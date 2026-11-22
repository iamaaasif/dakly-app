import { describe, expect, it } from 'vitest';

import {
  buildProductCardElement,
  parseCardTap,
  productCardElementSchema,
  productCardPayload,
} from './product-card';

const sizes = [
  { id: 'v-m', title: 'M', pricePoisha: 125000, inStock: true },
  { id: 'v-l', title: 'L', pricePoisha: 125000, inStock: true },
  { id: 'v-xxl', title: 'XXL', pricePoisha: 140000, inStock: false },
];

describe('buildProductCardElement', () => {
  it.each([
    ['Bangla', 'কটন পাঞ্জাবি'],
    ['Banglish', 'Cotton Panjabi Eid Special'],
    ['mixed', 'Eid কালেকশন Cotton পাঞ্জাবি'],
  ])('draws a %s product with price and three buttons', (_language, name) => {
    const element = buildProductCardElement({ productId: 'p1', name, variants: sizes });
    expect(element.title).toBe(name);
    expect(element.subtitle).toBe('৳1,250');
    expect(element.buttons.map(({ title }) => title)).toEqual([
      'Order now',
      'See sizes',
      'Talk to a person',
    ]);
    expect(productCardElementSchema.safeParse(element).success).toBe(true);
  });

  it('never shows the price of a sold-out size in the range', () => {
    const element = buildProductCardElement({
      productId: 'p1',
      name: 'Panjabi',
      variants: [
        { id: 'a', title: 'M', pricePoisha: 120000, inStock: true },
        { id: 'b', title: 'L', pricePoisha: 150000, inStock: true },
        { id: 'c', title: 'XL', pricePoisha: 999900, inStock: false },
      ],
    });
    expect(element.subtitle).toBe('৳1,200 – ৳1,500');
    expect(element.subtitle).not.toContain('9,999');
  });

  it('marks a sold-out product and offers no order button', () => {
    const element = buildProductCardElement({
      productId: 'p1',
      name: 'পাঞ্জাবি',
      variants: sizes.map((size) => ({ ...size, inStock: false })),
    });
    expect(element.subtitle).toBe('স্টক নেই (out of stock)');
    expect(element.buttons.map(({ title }) => title)).toEqual(['See sizes', 'Talk to a person']);
  });

  it('names the one size asked about and orders exactly that size', () => {
    const element = buildProductCardElement({
      productId: 'p1',
      name: 'পাঞ্জাবি',
      variants: sizes,
      onlyVariantId: 'v-l',
    });
    expect(element.subtitle).toBe('L: ৳1,250');
    expect(element.buttons[0]).toEqual({
      type: 'postback',
      title: 'Order now',
      payload: 'card:order:p1:v-l',
    });
    expect(element.buttons.some(({ title }) => title === 'See sizes')).toBe(false);
  });

  it('does not offer a sold-out size asked about', () => {
    const element = buildProductCardElement({
      productId: 'p1',
      name: 'Panjabi',
      variants: sizes,
      onlyVariantId: 'v-xxl',
    });
    expect(element.subtitle).toBe('স্টক নেই (out of stock)');
    expect(element.buttons.map(({ title }) => title)).toEqual(['Talk to a person']);
  });

  it('shortens a long name to the 80 characters Meta allows', () => {
    const element = buildProductCardElement({
      productId: 'p1',
      name: 'অতি দীর্ঘ নাম '.repeat(20),
      variants: sizes,
    });
    expect(element.title.length).toBeLessThanOrEqual(80);
    expect(productCardElementSchema.safeParse(element).success).toBe(true);
  });
});

describe('parseCardTap', () => {
  const product = '2f0f3c1e-6c1b-4f55-9a52-0a4b8a3f6c11';
  const variant = '7d9a5a10-1f43-4c7e-8d3b-3d1c1f0f9a22';

  it('reads back every payload the builder writes', () => {
    expect(parseCardTap(productCardPayload.order(product))).toEqual({
      kind: 'order',
      productId: product,
    });
    expect(parseCardTap(productCardPayload.order(product, variant))).toEqual({
      kind: 'order',
      productId: product,
      variantId: variant,
    });
    expect(parseCardTap(productCardPayload.sizes(product))).toEqual({
      kind: 'sizes',
      productId: product,
    });
    expect(parseCardTap(productCardPayload.human)).toEqual({ kind: 'human' });
  });

  it('ignores a campaign button and a damaged payload', () => {
    expect(parseCardTap('campaign:abc:0')).toBeUndefined();
    expect(parseCardTap('card:order:not-an-id')).toBeUndefined();
    expect(parseCardTap(`card:order:${product}:nope`)).toBeUndefined();
    expect(parseCardTap('card:refund')).toBeUndefined();
  });
});
