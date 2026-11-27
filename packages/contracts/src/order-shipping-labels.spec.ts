import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { shippingLabelQuerySchema } from './order-shipping-labels';

it('accepts a full batch of 100 order IDs', () => {
  const orderIds = Array.from({ length: 100 }, () => randomUUID());
  expect(shippingLabelQuerySchema.parse({ orderIds: orderIds.join(',') })).toEqual({ orderIds });
  expect(
    shippingLabelQuerySchema.safeParse({ orderIds: [...orderIds, randomUUID()].join(',') }).success,
  ).toBe(false);
});

it('normalizes repeated ids to one label and rejects an empty batch', () => {
  const id = '018fffa0-1000-7000-8000-000000000001';
  expect(shippingLabelQuerySchema.parse({ orderIds: `${id.toUpperCase()},${id}` })).toEqual({
    orderIds: [id],
  });
  expect(shippingLabelQuerySchema.safeParse({ orderIds: '' }).success).toBe(false);
});
