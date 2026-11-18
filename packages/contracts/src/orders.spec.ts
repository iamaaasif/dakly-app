import { describe, expect, it } from 'vitest';

import { createOrderSchema, orderListQuerySchema } from './orders';

describe('order list query', () => {
  it('takes a stage and an exclusive numeric cursor', () => {
    expect(orderListQuerySchema.parse({ stage: 'to_pack', cursor: '1003', limit: '10' })).toEqual({
      stage: 'to_pack',
      cursor: 1003,
      limit: 10,
    });
  });

  it.each([{ stage: 'inquiry' }, { cursor: '-1' }, { limit: '101' }, { storeId: 'other' }])(
    'rejects an unsupported filter %j',
    (query) => {
      expect(orderListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
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
