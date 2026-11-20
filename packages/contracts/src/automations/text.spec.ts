import { describe, expect, it } from 'vitest';

import { renderOrderFields, usesOrderFields } from './text';

const values = {
  order_number: '1042',
  order_total: '৳1,250',
  confirm_link: 'https://dkly.co/c/aB3dE5gH',
};

describe('workflow order text', () => {
  it('fills the order fields and leaves other braces alone', () => {
    expect(
      renderOrderFields(
        'অর্ডার {order_number} ({order_total}): {confirm_link} {first_name}',
        values,
      ),
    ).toBe('অর্ডার 1042 (৳1,250): https://dkly.co/c/aB3dE5gH {first_name}');
  });

  it('tells whether a text needs an order', () => {
    expect(usesOrderFields('Hi {first_name}')).toBe(false);
    expect(usesOrderFields('Order {order_number}')).toBe(true);
  });
});
