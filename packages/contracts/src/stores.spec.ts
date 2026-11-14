import { describe, expect, it } from 'vitest';
import * as contracts from './stores';

const input = {
  name: ' রিনার দোকান ',
  businessType: 'Clothing',
  district: 'Dhaka',
  howYouSell: ['social_media'],
  customerListSize: '2000_to_10000',
  planCode: 'growth',
  billingCycle: 'yearly',
};
describe('createStoreSchema', () => {
  it('accepts and trims business details', () => {
    expect(contracts.createStoreSchema.parse(input).name).toBe('রিনার দোকান');
  });
  it.each([
    { storeId: 'client-controlled' },
    { name: '' },
    { howYouSell: [] },
    { howYouSell: ['unknown'] },
    { billingCycle: 'weekly' },
    { customerListSize: 'huge' },
  ])('rejects invalid onboarding input %j', (change) => {
    expect(contracts.createStoreSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});
