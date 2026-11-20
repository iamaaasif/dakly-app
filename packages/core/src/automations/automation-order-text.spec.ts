import { describe, expect, it } from 'vitest';

import { formatTaka, renderOrderText } from './automation-order-text';

describe('workflow order text', () => {
  it.each([
    [126000, '৳1,260'],
    [12500050, '৳1,25,000.5'],
    [99, '৳0.99'],
  ])('writes %i poisha as %s', (poisha, expected) => {
    expect(formatTaka(poisha)).toBe(expected);
  });

  it('fills the order number, total and confirm link', () => {
    expect(
      renderOrderText(
        'অর্ডার {order_number}, {order_total}: {confirm_link}',
        { orderNumber: 1042, totalPoisha: 126000 },
        'https://dkly.co/c/aB3dE5gH',
      ),
    ).toBe('অর্ডার 1042, ৳1,260: https://dkly.co/c/aB3dE5gH');
  });
});
