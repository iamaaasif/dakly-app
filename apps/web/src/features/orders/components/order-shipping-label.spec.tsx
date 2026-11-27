// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import type { OrderShippingLabels } from '@dakly/contracts/order-shipping-labels';

import { OrderShippingLabel } from './order-shipping-label';

const store = { name: 'Mirpur Shop', phone: '01701000015' };
const label: OrderShippingLabels['labels'][number] = {
  id: '018fffa0-1000-7000-8000-000000000001',
  number: 1054,
  recipientName: 'Farhana Islam',
  recipientPhone: '01801-XXX028',
  recipientAddress: 'House 14, Block C, Mirpur',
  recipientDistrict: 'Dhaka',
  itemCount: 2,
  codDuePoisha: 22100,
};

afterEach(cleanup);

it('shows the shop, delivery and payment details on the label', () => {
  render(<OrderShippingLabel store={store} label={label} />);
  for (const content of [
    'Mirpur Shop',
    '01701-000015',
    'Farhana Islam',
    '01801-XXX028',
    'House 14, Block C, Mirpur',
    'Dhaka',
    '2 items',
    'Order #1054',
    '৳221',
  ]) {
    expect(screen.getByText(content)).toBeTruthy();
  }
  const barcode = screen.getByRole('img', { name: 'Order 1054 barcode' });
  expect(barcode.querySelectorAll('g rect').length).toBeGreaterThan(1);
});

it('shows Paid when no COD is due', () => {
  render(<OrderShippingLabel store={store} label={{ ...label, codDuePoisha: 0 }} />);
  expect(screen.getByText('Paid')).toBeTruthy();
  expect(screen.queryByText('৳0')).toBeNull();
});
