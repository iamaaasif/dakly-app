// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { OrderTabCounts } from '@dakly/contracts/order-inquiries';

import { OrderTabs } from './order-tabs';

const push = vi.hoisted(() => vi.fn());
vi.mock('@/lib/use-url-query', () => ({ useUrlRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('@/lib/store-request', () => ({
  useStoreRequest: () => ({ request: vi.fn(), contextTag: 'shop-a' }),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  push.mockClear();
});

const counts: OrderTabCounts = {
  inquiries: 4,
  to_confirm: 3,
  to_pack: 2,
  with_courier: 2,
  delivered: 3,
  pending: 1,
  on_hold: 1,
  returned: 1,
};

function renderTabs(query = { stage: 'to_confirm' as const, limit: 50 }) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderTabs query={query} counts={counts}>
        <p>panel</p>
      </OrderTabs>
    </QueryClientProvider>,
  );
}

it('lists the tabs in the design order, each with its count', () => {
  renderTabs();
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'Inquiries4',
    'To confirm3',
    'To pack2',
    'With courier2',
    'Delivered3',
    'Pending1',
    'On hold1',
    'Returned1',
  ]);
  expect(screen.getByRole('tab', { name: /^To confirm/ }).getAttribute('aria-selected')).toBe(
    'true',
  );
});

it('opens Pending by its payment status and Inquiries by their own address value', async () => {
  renderTabs();
  await userEvent.click(screen.getByRole('tab', { name: /^Pending/ }));
  expect(push).toHaveBeenLastCalledWith('/orders?limit=50&paymentStatus=advance_requested');
  await userEvent.click(screen.getByRole('tab', { name: /^Inquiries/ }));
  expect(push).toHaveBeenLastCalledWith('/orders?limit=50&tab=inquiries');
});

it('moves with the arrow keys and opens a tab only on Enter', async () => {
  renderTabs();
  screen.getByRole('tab', { name: /^To confirm/ }).focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: /^To pack/ })).toBe(document.activeElement);
  expect(push).not.toHaveBeenCalled();
  await userEvent.keyboard('{Enter}');
  expect(push).toHaveBeenLastCalledWith('/orders?limit=50&stage=to_pack');
});
