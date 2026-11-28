import { describe, expect, it } from 'vitest';

import { orderStageTransitions } from '@dakly/contracts/orders';

import { orderStageCounts, stagesForOrderTab } from './order-stage';

describe('Order stage transitions', () => {
  it('allows the fulfilment moves and staff moves back out of Courier, Delivered, Returned and Cancelled', () => {
    expect(orderStageTransitions).toEqual({
      to_confirm: ['to_pack', 'on_hold', 'cancelled'],
      on_hold: ['to_confirm', 'to_pack', 'cancelled'],
      to_pack: ['with_courier', 'on_hold', 'cancelled'],
      with_courier: [
        'delivered',
        'partially_delivered',
        'returned',
        'to_confirm',
        'on_hold',
        'to_pack',
      ],
      delivered: ['returned', 'with_courier', 'to_confirm', 'on_hold', 'to_pack'],
      partially_delivered: ['returned', 'with_courier', 'to_confirm', 'on_hold', 'to_pack'],
      returned: ['with_courier', 'to_confirm', 'on_hold', 'to_pack'],
      cancelled: ['to_confirm', 'on_hold', 'to_pack'],
    });
  });
});

describe('Order tab counts', () => {
  it('keeps held orders out of To confirm and adds partly delivered ones to Delivered', () => {
    const counts = orderStageCounts([
      { stage: 'to_confirm', count: 3 },
      { stage: 'on_hold', count: 2 },
      { stage: 'delivered', count: 4 },
      { stage: 'partially_delivered', count: 1 },
    ]);
    expect(counts).toMatchObject({ to_confirm: 3, on_hold: 2, delivered: 5, returned: 0 });
    expect(stagesForOrderTab('to_confirm')).toEqual(['to_confirm']);
    expect(stagesForOrderTab('delivered')).toEqual(['delivered', 'partially_delivered']);
  });
});
