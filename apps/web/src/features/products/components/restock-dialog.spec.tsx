// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { RestockDialog } from './restock-dialog';
import { sessionContextKey } from '@/lib/session-context';

const productId = '019c01ea-cf15-7d31-a7f5-d73d66007ae2';
const medium = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
const large = '019c01ea-cf15-7d31-a7f5-d73d66007ae4';
const extraLarge = '019c01ea-cf15-7d31-a7f5-d73d66007ae5';
const size = (id: string, title: string, available: number) => ({
  id,
  title,
  optionValues: {},
  sku: null,
  costPoisha: null,
  priceOverridePoisha: null,
  pricePoisha: 245000,
  isDefault: false,
  onHand: available,
  reserved: 0,
  available,
});
const product = {
  id: productId,
  name: 'Cotton Panjabi',
  isStockTracked: true,
  variants: [size(medium, 'M', 4), size(large, 'L', 2), size(extraLarge, 'XL', 0)],
} as unknown as ProductResponse;

function reply(body: unknown, status = 200) {
  const headers = { 'x-session-context': 'verified' };
  return body === undefined
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });
}
function answer(path: string, waiting: unknown[]) {
  if (path.endsWith('/restock-waiting')) return reply({ items: waiting });
  if (path.endsWith('/restock-notifications')) return reply({ queued: 3, waiting: 0 });
  return reply(undefined, 204);
}
type Call = { method: string; path: string; body: unknown };
function show(waiting: { variantId: string; waiting: number }[], failOnce?: string) {
  let failed = false;
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (init?.method === 'POST' && failOnce && path.includes(failOnce) && !failed) {
      failed = true;
      return reply({ error: { code: 'FAILED', message: 'Stock adjustment failed' } }, 500);
    }
    return answer(path, waiting);
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'actor', name: 'Actor' },
    hasMemberships: true,
    contextTag: 'verified',
    currentStore: { storeId: 'shop', name: 'Shop', canViewProducts: true, canEditProducts: true },
  } as unknown as SessionContext);
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <RestockDialog product={product} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { calls, onClose };
}
const writes = (calls: Call[]) => calls.filter((call) => call.method === 'POST');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Restock dialog', () => {
  it('lists every size with its stock and waiting people', async () => {
    show([{ variantId: extraLarge, waiting: 3 }]);
    expect(await screen.findByText(/3 waiting/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Restock Cotton Panjabi' })).toBeTruthy();
    expect(screen.getByText('How many new pieces did you get?')).toBeTruthy();
    expect(screen.getByText('4 now')).toBeTruthy();
    expect(screen.getByText('2 now')).toBeTruthy();
    expect(screen.getByLabelText('XL')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /people who were waiting/ })).toBeTruthy();
  });

  it('adds stock for the sizes filled in and messages only the sizes with people waiting', async () => {
    const { calls, onClose } = show([{ variantId: extraLarge, waiting: 3 }]);
    await screen.findByText(/3 waiting/);
    await userEvent.type(screen.getByLabelText('XL'), '10');
    await userEvent.type(screen.getByLabelText('M'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save stock' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes(calls).map(({ path, body }) => [path, body])).toEqual([
      [`/api/variants/${medium}/stock-adjustments`, { quantity: 5, reason: 'Restock' }],
      [`/api/variants/${extraLarge}/stock-adjustments`, { quantity: 10, reason: 'Restock' }],
      [`/api/variants/${extraLarge}/restock-notifications`, undefined],
    ]);
  });

  it('adds stock without messaging when the box is unticked', async () => {
    const { calls, onClose } = show([{ variantId: extraLarge, waiting: 3 }]);
    await screen.findByText(/3 waiting/);
    await userEvent.type(screen.getByLabelText('XL'), '10');
    await userEvent.click(screen.getByRole('checkbox', { name: /people who were waiting/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save stock' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes(calls).map(({ path }) => path)).toEqual([
      `/api/variants/${extraLarge}/stock-adjustments`,
    ]);
  });

  it('hides the message box when nobody is waiting', async () => {
    const { calls } = show([]);
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith('restock-waiting'))).toBe(true),
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('asks for at least one size and sends nothing', async () => {
    const { calls, onClose } = show([]);
    await userEvent.click(screen.getByRole('button', { name: 'Save stock' }));
    expect((await screen.findByRole('alert')).textContent).toContain('at least one size');
    expect(writes(calls)).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not add the same pieces twice when a retry follows a partly saved restock', async () => {
    const { calls, onClose } = show([{ variantId: extraLarge, waiting: 3 }], extraLarge);
    await screen.findByText(/3 waiting/);
    await userEvent.type(screen.getByLabelText('M'), '5');
    await userEvent.type(screen.getByLabelText('XL'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save stock' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Stock adjustment failed');
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Save stock' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes(calls).map(({ path, body }) => [path, body])).toEqual([
      [`/api/variants/${medium}/stock-adjustments`, { quantity: 5, reason: 'Restock' }],
      [`/api/variants/${extraLarge}/stock-adjustments`, { quantity: 10, reason: 'Restock' }],
      [`/api/variants/${extraLarge}/stock-adjustments`, { quantity: 10, reason: 'Restock' }],
      [`/api/variants/${extraLarge}/restock-notifications`, undefined],
    ]);
  });
});
