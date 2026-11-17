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

describe('store settings patches', () => {
  it('normalizes contact details and preserves omission versus clearing', () => {
    expect(
      contracts.changeStoreSettingsSchema.parse({ phone: '+880 ১৭১২-৩৪৫৬৭৮', legalName: null }),
    ).toEqual({ phone: '01712345678', legalName: null });
    expect(contracts.changeStoreSettingsSchema.parse({ name: ' দোকান ' })).toEqual({
      name: 'দোকান',
    });
    expect(contracts.changeStoreSettingsSchema.parse({ vatBin: '1234567890123' })).toEqual({
      vatBin: '1234567890123',
    });
  });
  it.each([
    {},
    { storeId: 'forged' },
    { name: null },
    { name: ' ' },
    { legalName: '' },
    { email: 'invalid' },
    { phone: '123' },
    { vatBin: '123456789012' },
    { vatBin: '১২৩৪৫৬৭৮৯০১২৩' },
    { extensions: [] },
  ])('rejects invalid settings %j', (input) => {
    expect(contracts.changeStoreSettingsSchema.safeParse(input).success).toBe(false);
  });
  it('allows null to clear each optional setting', () => {
    const input = {
      legalName: null,
      businessType: null,
      phone: null,
      email: null,
      address: null,
      district: null,
      vatBin: null,
      tradeLicenceNumber: null,
    };
    expect(contracts.changeStoreSettingsSchema.parse(input)).toEqual(input);
  });
  it('defaults the stock threshold to three and accepts a whole stock section', () => {
    expect(contracts.stockSettingsSchema.parse({})).toEqual({ lowStockThreshold: 3 });
    expect(contracts.changeStoreSettingsSchema.parse({ stock: { lowStockThreshold: 5 } })).toEqual({
      stock: { lowStockThreshold: 5 },
    });
    expect(
      contracts.changeStoreSettingsSchema.safeParse({ stock: { lowStockThreshold: -1 } }).success,
    ).toBe(false);
    expect(
      contracts.changeStoreSettingsSchema.safeParse({ stock: { lowStockThreshold: 1.5 } }).success,
    ).toBe(false);
  });

  it('accepts release 1 extensions or an empty selection', () => {
    expect(
      contracts.changeStoreExtensionsSchema.parse({
        extensions: ['chats', 'sales', 'social_auto_post'],
      }).extensions,
    ).toHaveLength(3);
    expect(contracts.changeStoreExtensionsSchema.parse({ extensions: [] })).toEqual({
      extensions: [],
    });
  });
  it.each([
    {},
    { extensions: ['physical_shop'] },
    { extensions: ['core'] },
    { extensions: ['chats', 'chats'] },
    { extensions: null },
    { extensions: [], storeId: 'forged' },
  ])('rejects invalid extension changes %j', (input) => {
    expect(contracts.changeStoreExtensionsSchema.safeParse(input).success).toBe(false);
  });
});
