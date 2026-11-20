import { describe, expect, it } from 'vitest';

import { productListQuerySchema, productScreenQuerySchema } from './products';

describe('product screen query', () => {
  it('keeps a selected variant separate from the catalogue filters', () => {
    const adjust = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
    expect(productScreenQuerySchema.parse({ adjust, search: 'Cotton' })).toEqual({
      adjust,
      search: 'Cotton',
      limit: 50,
    });
    expect(productScreenQuerySchema.safeParse({ adjust: 'not-a-uuid' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ adjust }).success).toBe(false);
  });
});

describe('product editor selection', () => {
  const product = '019c01ea-cf15-7d31-a7f5-d73d66007ae2';
  it('opens creation and a saved product from the address', () => {
    expect(productScreenQuerySchema.parse({ create: '1' })).toEqual({ create: '1', limit: 50 });
    expect(productScreenQuerySchema.parse({ product })).toEqual({ product, limit: 50 });
    expect(productScreenQuerySchema.parse({ product, productTab: 'stock' })).toEqual({
      product,
      productTab: 'stock',
      limit: 50,
    });
    expect(productScreenQuerySchema.safeParse({ productTab: 'invalid' }).success).toBe(false);
    expect(productScreenQuerySchema.safeParse({ product, create: '1' }).success).toBe(false);
    expect(productScreenQuerySchema.safeParse({ import: '1', create: '1' }).success).toBe(false);
    expect(productScreenQuerySchema.parse({ import: '1' })).toEqual({ import: '1', limit: 50 });
    expect(productScreenQuerySchema.safeParse({ product, adjust: product }).success).toBe(false);
    expect(productScreenQuerySchema.safeParse({ create: 'yes' }).success).toBe(false);
  });
});
