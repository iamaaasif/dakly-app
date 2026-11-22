// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { ProductBulkPanel } from './product-bulk-panel';
import { sessionContextKey } from '@/lib/session-context';

const variant = (id: string, onHand: number, title = 'Default') => ({
  id,
  title,
  costPoisha: 65000,
  onHand,
  reserved: 0,
  available: onHand,
});
const products = [
  {
    id: '019c01ea-cf15-7d31-a7f5-d73d66007a01',
    name: 'Cotton T-shirt',
    category: 'Clothing',
    status: 'active',
    pricePoisha: 120000,
    compareAtPricePoisha: null,
    isStockTracked: true,
    variants: [{ ...variant('v1', 40), priceOverridePoisha: null }],
  },
  {
    id: '019c01ea-cf15-7d31-a7f5-d73d66007a02',
    name: 'Cotton Panjabi',
    category: 'Clothing',
    status: 'active',
    pricePoisha: 245000,
    compareAtPricePoisha: 295000,
    isStockTracked: true,
    variants: [
      { ...variant('v2', 4, 'M'), priceOverridePoisha: null },
      { ...variant('v3', 2, 'L'), priceOverridePoisha: 230000 },
    ],
  },
] as unknown as ProductResponse[];

function show() {
  const writes: unknown[] = [];
  vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') writes.push(JSON.parse(String(init.body)));
    return Response.json(
      { id: 'edit', changedProducts: 1, changedValues: 2, createdAt: '', undoUntil: '' },
      { headers: { 'x-session-context': 'verified' } },
    );
  });
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
      <ProductBulkPanel products={products} preset={undefined} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { writes, onClose };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Product bulk edit', () => {
  it('shows old and new values in the review and sends only what changed', async () => {
    const { writes, onClose } = show();
    expect(screen.getByRole('button', { name: 'Review 0 changes' })).toHaveProperty(
      'disabled',
      true,
    );
    const price = screen.getByLabelText('Price for Cotton T-shirt');
    await userEvent.clear(price);
    await userEvent.type(price, '1250');
    // A blank cell is not an edit to blank.
    await userEvent.clear(screen.getByLabelText('Old price for Cotton Panjabi'));
    await userEvent.clear(screen.getByLabelText('Category for Cotton Panjabi'));
    await userEvent.click(screen.getByRole('button', { name: 'Review 1 change' }));

    expect(screen.getByText('Price: Cotton T-shirt 1,200 → 1,250.')).toBeTruthy();
    expect(screen.getByText(/Undo stays for 24 hours/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes).toEqual([{ rows: [{ productId: products[0]!.id, pricePoisha: 125000 }] }]);
  });

  it('shows price read-only when a size has its own price', () => {
    show();
    expect(screen.queryByLabelText('Price for Cotton Panjabi')).toBeNull();
    expect(screen.getByLabelText('Price for Cotton T-shirt')).toBeTruthy();
  });

  it('asks for one reason when stock changes and does not edit stock of a product with sizes', async () => {
    const { writes } = show();
    expect(screen.queryByLabelText('Stock for Cotton Panjabi')).toBeNull();
    const stock = screen.getByLabelText('Stock for Cotton T-shirt');
    await userEvent.clear(stock);
    await userEvent.type(stock, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Review 1 change' }));
    expect(await screen.findByText('Choose a reason for the stock change')).toBeTruthy();
    expect(screen.queryByText(/Review: /)).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Reason for the stock change'), 'Restock');
    await userEvent.click(screen.getByRole('button', { name: 'Review 1 change' }));
    expect(screen.getByText('Stock: Cotton T-shirt 40 → 45 (Restock).')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(writes).toEqual([
        { rows: [{ productId: products[0]!.id, stock: 45 }], stockReason: 'Restock' },
      ]),
    );
  });
});
