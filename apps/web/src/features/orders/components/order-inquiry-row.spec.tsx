// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import type { OrderInquiry } from '@dakly/contracts/order-inquiries';

import { OrderInquiryRow } from './order-inquiry-row';

afterEach(cleanup);

const inquiry: OrderInquiry = {
  conversationId: 'chat-1',
  contactId: 'contact-1',
  contactName: 'সুমাইয়া রহমান',
  channel: 'whatsapp',
  customerKind: 'repeat',
  lastMessageAt: '2026-11-27T10:00:00.000Z',
  product: { id: 'product-1', name: 'জামদানি শাড়ি', pricePoisha: 320000 },
};

it('shows who asked, about what, at which price, and opens that chat to make the order', () => {
  render(
    <ul>
      <OrderInquiryRow inquiry={inquiry} canEdit />
    </ul>,
  );
  expect(screen.getByText('Repeat customer')).toBeTruthy();
  expect(screen.getByText('জামদানি শাড়ি')).toBeTruthy();
  expect(screen.getByText('৳3,200')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Make order for সুমাইয়া রহমান' }).getAttribute('href'),
  ).toBe('/chats?chat=chat-1&panel=customer');
});

it('names a chat with no contact name or product, and hides Make order without edit access', () => {
  render(
    <ul>
      <OrderInquiryRow inquiry={{ ...inquiry, contactName: null, product: null }} canEdit={false} />
    </ul>,
  );
  expect(screen.getByText('Unknown customer')).toBeTruthy();
  expect(screen.getByText('No product shown yet')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Make order/ })).toBeNull();
});
