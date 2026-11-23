import { describe, expect, it } from 'vitest';

import { createStoreSchema } from '@dakly/contracts/stores';

import { firstShopInput } from './first-shop';

describe('firstShopInput', () => {
  it('names the shop after the business and starts it on the free plan', () => {
    const input = firstShopInput({
      businessName: 'Urban Trend',
      websiteUrl: 'facebook.com/urbantrend',
      offering: 'products',
    });
    expect(input).toMatchObject({ name: 'Urban Trend', planCode: 'free', offering: 'products' });
    expect(createStoreSchema.safeParse(input).success).toBe(true);
  });
});
