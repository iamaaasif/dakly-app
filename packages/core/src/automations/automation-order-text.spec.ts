import { describe, expect, it } from 'vitest';

import { renderOrderText } from './automation-order-text';

describe('renderOrderText', () => {
  it('fills the order number, the total in lakh grouping and the confirm link', () => {
    expect(
      renderOrderText(
        'অর্ডার {order_number}, {order_total}: {confirm_link}',
        { orderNumber: 1042, totalPoisha: 123456750 },
        'https://dkly.co/c/aB3dE5gH',
      ),
    ).toBe('অর্ডার 1042, ৳12,34,567.50: https://dkly.co/c/aB3dE5gH');
  });
});
