// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderListItem } from '@dakly/contracts/orders';

import { OrderRow } from './order-row';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/store-request', () => ({
  useStoreRequest: () => ({ request, contextTag: 'shop-a' }),
}));

const order: OrderListItem = {
  id: 'order-id',
  number: 1056,
  buyerName: null,
  recipientName: 'Tanvir Hasan',
  stage: 'with_courier',
  source: 'messenger',
  paymentStatus: 'cod_pending',
  itemsSubtotalPoisha: 150000,
  orderDiscountPoisha: 0,
  deliveryChargePoisha: 0,
  totalPoisha: 150000,
  advancePaidPoisha: 0,
  codAmountPoisha: 150000,
  codCollectedPoisha: null,
  deliveredItemsSubtotalPoisha: null,
  deliveredOrderDiscountPoisha: null,
  createdAt: '2026-11-09T05:00:00.000Z',
  returnRisk: 'good',
  parcelHistory: { parcels: 5, returned: 0 },
  courier: 'steadfast',
  courierOtherName: null,
  returnedAt: null,
  returnReason: null,
  itemPreview: 'Casual shirt (M) × 1',
  isWaitingForConfirmation: false,
  customerBadge: 'new',
};

function renderRow(row: OrderListItem, canEdit: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ul>
        <OrderRow order={row} href="/orders?selected=order-id" canEdit={canEdit} />
      </ul>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  request.mockReset();
});

describe('order row', () => {
  it('names the buyer and shows who the parcel goes to when it is someone else', () => {
    renderRow({ ...order, buyerName: 'Nusrat Jahan' }, false);
    expect(screen.getByRole('link', { name: 'Nusrat Jahan' })).toBeTruthy();
    expect(screen.getByText(/to Tanvir Hasan/)).toBeTruthy();
  });

  it.each([
    ['new', 'New'],
    ['repeat', 'Repeat'],
    ['vip', 'VIP'],
  ] as const)('shows the %s customer badge', (customerBadge, label) => {
    renderRow({ ...order, customerBadge }, false);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('falls back to the recipient when no buyer is known and adds no "to" line', () => {
    renderRow(order, false);
    expect(screen.getByRole('link', { name: 'Tanvir Hasan' })).toBeTruthy();
    expect(screen.queryByText(/ to /)).toBeNull();
  });

  it('marks a parcel with the courier as delivered from the row', async () => {
    request.mockResolvedValue({ ...order, stage: 'delivered' });
    renderRow(order, true);
    expect(screen.getByText('Steadfast')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mark order #1056 delivered' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/orders/order-id/stage', {
        method: 'POST',
        body: { to: 'delivered' },
      }),
    );
  });

  it('shows the failure reason when the stage change is refused', async () => {
    request.mockRejectedValue(new Error('This order already changed.'));
    renderRow(order, true);
    await userEvent.click(screen.getByRole('button', { name: 'Mark order #1056 delivered' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This order already changed.');
  });

  it('offers only Details without edit access', () => {
    renderRow(order, false);
    expect(screen.queryByRole('button', { name: /delivered/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Details for order #1056' })).toBeTruthy();
  });

  it('shows the courier, return date and reason on a returned parcel', () => {
    renderRow(
      {
        ...order,
        stage: 'returned',
        courier: 'redx',
        returnedAt: '2026-11-06T05:00:00.000Z',
        returnReason: 'Refused at the door',
      },
      true,
    );
    expect(screen.getByText('RedX · Returned Nov 6')).toBeTruthy();
    expect(screen.getByText('Refused at the door')).toBeTruthy();
  });

  it('hides the return risk badge once the parcel is finished', () => {
    renderRow({ ...order, stage: 'returned', returnRisk: 'high' }, true);
    expect(screen.queryByText('High return risk')).toBeNull();
  });

  it('offers Book courier on a packed order and no action on finished ones', () => {
    renderRow({ ...order, stage: 'to_pack', courier: null }, true);
    expect(screen.getByRole('link', { name: 'Book courier for order #1056' })).toBeTruthy();
    cleanup();
    renderRow({ ...order, stage: 'to_pack', courier: null }, false);
    expect(screen.getByRole('link', { name: 'Details for order #1056' })).toBeTruthy();
    cleanup();
    for (const stage of ['delivered', 'returned', 'cancelled'] as const) {
      renderRow({ ...order, stage }, true);
      expect(screen.queryByRole('button')).toBeNull();
      expect(document.querySelector('[data-order-row-action]')).toBeNull();
      cleanup();
    }
  });
});
