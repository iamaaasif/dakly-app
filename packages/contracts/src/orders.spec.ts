import { describe, expect, it } from 'vitest';

import {
  codCollectedSchema,
  createOrderSchema,
  dispatchOrderSchema,
  editOrderSchema,
  orderListQuerySchema,
  orderStageChangeSchema,
  partialDeliveryFormSchema,
} from './orders';

describe('order list query', () => {
  it('takes a stage and an exclusive numeric cursor', () => {
    expect(orderListQuerySchema.parse({ stage: 'to_pack', cursor: '1003', limit: '10' })).toEqual({
      stage: 'to_pack',
      cursor: 1003,
      limit: 10,
    });
  });

  it('rejects a reversed date range or unknown source and courier', () => {
    for (const query of [
      { createdFrom: '2026-11-18', createdThrough: '2026-11-17' },
      { source: 'marketplace' },
      { courier: 'unknown' },
    ])
      expect(orderListQuerySchema.safeParse(query).success).toBe(false);
  });

  it.each([
    { stage: 'inquiry' },
    { cursor: '-1' },
    { limit: '101' },
    { storeId: 'other' },
    { search: 'invalid\0text' },
  ])('rejects an unsupported filter %j', (query) => {
    expect(orderListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('staff order input', () => {
  const contactId = '019c01ea-cf15-7d31-a7f5-d73d66007ad8';
  const variantId = '019c01ea-cf15-7d31-a7f5-d73d66007ae2';
  const order = {
    buyer: { contactId },
    recipient: { name: 'Karim', phone: '+880 1712-458903', address: 'Dhanmondi', areaId: 301 },
    items: [{ variantId, quantity: 2 }],
  };

  it('normalises the recipient number and defaults to self-delivery', () => {
    expect(createOrderSchema.parse(order)).toMatchObject({
      buyer: { contactId },
      recipient: { phone: '01712458903', isBuyer: true },
      items: [{ variantId, quantity: 2, lineDiscountPoisha: 0 }],
    });
  });

  it('normalises a variant ID before checking for duplicate lines', () => {
    const upper = variantId.toUpperCase();
    expect(
      createOrderSchema.parse({ ...order, items: [{ variantId: upper, quantity: 2 }] }).items[0],
    ).toMatchObject({ variantId });
    expect(
      createOrderSchema.safeParse({
        ...order,
        items: [
          { variantId, quantity: 1 },
          { variantId: upper, quantity: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('allows changing the address without sending the number or recipient type', () => {
    expect(
      editOrderSchema.parse({ items: order.items, recipient: { address: 'Mirpur' } }).recipient,
    ).toEqual({ address: 'Mirpur' });
  });

  it('requires separate buyer fields and accepts a different delivery recipient', () => {
    const recipient = { ...order.recipient, isBuyer: false };
    expect(
      createOrderSchema.parse({ ...order, recipient, buyer: { name: 'Rahim' } }),
    ).toMatchObject({
      buyer: { name: 'Rahim' },
      recipient: { name: 'Karim', isBuyer: false },
    });
    expect(createOrderSchema.safeParse({ ...order, recipient, buyer: {} }).success).toBe(false);
  });

  it.each([
    { codAmountPoisha: 110000 },
    { deliveryChargePoisha: -1 },
    { advancePaidPoisha: 100.5 },
    { items: [{ variantId, quantity: 2, unitPricePoisha: 62500 }] },
    {
      items: [
        { variantId, quantity: 1 },
        { variantId, quantity: 1 },
      ],
    },
    { items: [{ variantId, quantity: 0 }] },
  ])('rejects client totals or invalid line and money fields %j', (change) => {
    expect(createOrderSchema.safeParse({ ...order, ...change }).success).toBe(false);
  });
});

it('rejects a hold follow-up date in year zero', () => {
  expect(
    orderStageChangeSchema.safeParse({
      to: 'on_hold',
      reason: 'pre_order',
      followUpOn: '0000-01-01',
    }).success,
  ).toBe(false);
});

it('accepts a delivery-only patch and refuses an empty order edit', () => {
  const expectedUpdatedAt = '2026-11-18T02:00:00.000Z';
  expect(editOrderSchema.parse({ expectedUpdatedAt, recipient: { address: 'Mirpur' } })).toEqual({
    expectedUpdatedAt,
    recipient: { address: 'Mirpur' },
  });
  for (const empty of [{}, { expectedUpdatedAt }, { recipient: {} }])
    expect(editOrderSchema.safeParse(empty).success).toBe(false);
});

describe('manual delivery inputs', () => {
  it('accepts no courier and requires the name only for Other', () => {
    expect(dispatchOrderSchema.parse({})).toEqual({});
    expect(
      dispatchOrderSchema.parse({ courier: 'other', courierOtherName: ' Local rider ' }),
    ).toEqual({ courier: 'other', courierOtherName: 'Local rider' });
    expect(dispatchOrderSchema.safeParse({ courier: 'other' }).success).toBe(false);
    expect(
      dispatchOrderSchema.safeParse({ courier: 'pathao', courierOtherName: 'Other' }).success,
    ).toBe(false);
    expect(dispatchOrderSchema.safeParse({ courier: 'invalid' }).success).toBe(false);
  });

  it.each([-1, 10.75])('rejects an invalid collected amount %s', (amountPoisha) => {
    expect(codCollectedSchema.safeParse({ amountPoisha }).success).toBe(false);
  });

  it('allows zero COD and refuses a negative delivered quantity', () => {
    expect(codCollectedSchema.parse({ amountPoisha: 0 })).toEqual({ amountPoisha: 0 });
    expect(
      orderStageChangeSchema.safeParse({
        to: 'partially_delivered',
        note: 'The customer kept one item',
        items: [{ itemId: '019c01ea-cf15-7d31-a7f5-d73d66007ae2', quantity: -1 }],
      }).success,
    ).toBe(false);
  });
});

it.each([
  [0, 'Enter at least one delivered unit.'],
  [2, 'Use Mark delivered if all units arrived.'],
])('explains why %s of two units cannot be partly delivered', (quantity, message) => {
  const id = 'e67183e9-ab27-4cf5-a671-7ee21a509efe';
  const form = partialDeliveryFormSchema([{ id, quantity: 2 }]);
  const result = form.safeParse({
    to: 'partially_delivered',
    items: [{ itemId: id, quantity }],
    note: 'Staff counted the parcel',
  });
  expect(result.error?.issues).toMatchObject([{ path: ['items', 0, 'quantity'], message }]);
});
