import { describe, expect, it } from 'vitest';

import type { OrderDetail } from '@dakly/contracts/orders';

import { orderStageActions } from './order-stage-actions';

describe('order stage actions', () => {
  it('offers partly delivered only when a parcel has more than one unit', () => {
    const order = {
      stage: 'with_courier',
      source: 'manual',
      paymentStatus: 'cod_pending',
      items: [{ quantity: 1 }],
    } as OrderDetail;
    expect(orderStageActions(order, true)).toEqual([
      'delivered',
      'returned',
      'to_confirm',
      'on_hold',
      'to_pack',
    ]);
    expect(
      orderStageActions({ ...order, items: [{ ...order.items[0]!, quantity: 2 }] }, true),
    ).toContain('partially_delivered');
  });

  it('lets staff move a delivered order back to any earlier stage', () => {
    const order = {
      stage: 'delivered',
      source: 'manual',
      paymentStatus: 'cod_collected',
      items: [{ quantity: 1 }],
    } as OrderDetail;
    expect(orderStageActions(order, true)).toEqual([
      'returned',
      'with_courier',
      'to_confirm',
      'on_hold',
      'to_pack',
    ]);
  });

  it('lets staff reopen a returned or cancelled order', () => {
    const returned = {
      stage: 'returned',
      source: 'manual',
      paymentStatus: 'refund_due',
      items: [{ quantity: 1 }],
    } as OrderDetail;
    expect(orderStageActions(returned, true)).toEqual([
      'with_courier',
      'to_confirm',
      'on_hold',
      'to_pack',
    ]);
    expect(orderStageActions({ ...returned, stage: 'cancelled' }, true)).toEqual([
      'to_confirm',
      'on_hold',
      'to_pack',
    ]);
  });
});
