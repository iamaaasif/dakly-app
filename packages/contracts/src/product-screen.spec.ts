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
