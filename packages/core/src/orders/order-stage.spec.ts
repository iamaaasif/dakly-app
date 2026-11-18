import { describe, expect, it } from 'vitest';

import { orderStageTransitions } from './order-stage';

describe('Order stage transitions', () => {
  it('allows only the fulfilment moves in the order rules', () => {
    expect(orderStageTransitions).toEqual({
      to_confirm: ['to_pack', 'on_hold', 'cancelled'],
      on_hold: ['to_confirm', 'to_pack', 'cancelled'],
      to_pack: ['with_courier', 'on_hold', 'cancelled'],
      with_courier: ['delivered', 'partially_delivered', 'returned'],
      delivered: ['returned'],
      partially_delivered: ['returned'],
      returned: [],
      cancelled: [],
    });
  });
});
