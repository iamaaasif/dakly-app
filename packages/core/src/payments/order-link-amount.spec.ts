import { describe, expect, it } from 'vitest';

import { orderLinkAmount } from './order-link-amount';

const order = { totalPoisha: 150_000, deliveryChargePoisha: 12_000, advancePaidPoisha: 0 };

describe('orderLinkAmount', () => {
  it('asks for the delivery charge when an advance names no amount', () => {
    expect(orderLinkAmount({ kind: 'advance' }, order)).toBe(12_000);
  });

  it('asks for the unpaid rest of the order on a full payment', () => {
    expect(orderLinkAmount({ kind: 'full' }, { ...order, advancePaidPoisha: 12_000 })).toBe(
      138_000,
    );
  });

  it('accepts a named advance up to what is unpaid', () => {
    expect(orderLinkAmount({ kind: 'advance', amountPoisha: 150_000 }, order)).toBe(150_000);
  });

  it.each([150_001, 1_000_000])(
    'refuses an advance of %i poisha above the unpaid amount',
    (amountPoisha) => {
      expect(() => orderLinkAmount({ kind: 'advance', amountPoisha }, order)).toThrow(
        'no more than what is still unpaid',
      );
    },
  );

  it('refuses an advance when the delivery charge is zero and no amount is named', () => {
    expect(() =>
      orderLinkAmount({ kind: 'advance' }, { ...order, deliveryChargePoisha: 0 }),
    ).toThrow('more than zero');
  });

  it('refuses a link for an order that is paid in full', () => {
    expect(() =>
      orderLinkAmount({ kind: 'full' }, { ...order, advancePaidPoisha: 150_000 }),
    ).toThrow('already paid');
  });
});
