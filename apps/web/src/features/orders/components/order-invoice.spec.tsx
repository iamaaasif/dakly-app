// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { OrderInvoice } from '@dakly/contracts/order-invoice';

import { OrderInvoiceDocument } from './order-invoice';

it('prints the buyer, delivery snapshot and recorded invoice amounts', () => {
  const invoice: OrderInvoice = {
    store: { name: 'Aarong Road Shop', phone: '01701000015', timeZone: 'Asia/Dhaka' },
    number: 1054,
    createdAt: '2026-11-25T20:00:00Z',
    buyerName: 'Nusrat Jahan',
    recipientName: 'Farhana Islam',
    recipientPhone: '01801-XXX028',
    recipientAddress: 'House 14, Block C, Mirpur',
    recipientDistrict: 'Dhaka',
    isPartialDelivery: false,
    items: [
      {
        id: '018fffa0-1000-7000-8000-000000000001',
        productName: 'Cotton Panjabi',
        variantTitle: 'M',
        quantity: 2,
        unitPricePoisha: 125050,
        lineDiscountPoisha: 1000,
      },
    ],
    itemsSubtotalPoisha: 249100,
    deliveryChargePoisha: 6000,
    orderDiscountPoisha: 9000,
    advancePaidPoisha: 20000,
    codAmountPoisha: 226100,
  };

  render(<OrderInvoiceDocument invoice={invoice} />);

  expect(screen.getByRole('heading', { name: 'Invoice #1054' })).toBeTruthy();
  for (const content of [
    'Aarong Road Shop',
    '01701-000015',
    'Thursday, 26 November 2026',
    'Nusrat Jahan',
    'Farhana Islam',
    '01801-XXX028',
    'House 14, Block C, Mirpur',
    'Dhaka',
  ]) {
    expect(screen.getByText(content)).toBeTruthy();
  }
  const item = within(screen.getByRole('row', { name: /Cotton Panjabi/ }));
  expect(item.getByText('M')).toBeTruthy();
  expect(item.getByText('2')).toBeTruthy();
  expect(item.getByText('৳1,250.50')).toBeTruthy();
  expect(item.getByText('-৳10')).toBeTruthy();
  for (const [label, amount] of [
    ['Items subtotal', '৳2,491'],
    ['Delivery charge', '৳60'],
    ['Order discount', '-৳90'],
    ['Advance paid', '-৳200'],
    ['COD to collect', '৳2,261'],
  ]) {
    expect(screen.getByText(label!).nextElementSibling?.textContent).toBe(amount);
  }
});
