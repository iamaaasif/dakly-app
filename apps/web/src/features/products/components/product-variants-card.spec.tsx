// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProductSchema, type ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { ProductForm } from './product-form';
import { productsKeys } from '@/lib/product-query-keys';
import { sessionContextKey } from '@/lib/session-context';

const page = {
  title: 'Cotton T-shirt',
  backHref: '/products',
  photos: <p>Photos</p>,
  status: <p>Status</p>,
};

const saved: ProductResponse = {
  ...createProductSchema.parse({ name: 'Cotton T-shirt', pricePoisha: 120000 }),
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  imageFileIds: [],
  photos: [],
  readiness: [],
  variants: [
    {
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae3',
      imageFileIds: [],
      photos: [],
      optionValues: {},
      sku: 'TS-1',
      priceOverridePoisha: null,
      lowStockThreshold: null,
      costPoisha: 65000,
      title: 'Default',
      isDefault: true,
      pricePoisha: 120000,
      onHand: 12,
      reserved: 0,
      available: 12,
    },
  ],
  createdAt: '2026-11-18T04:00:00Z',
  updatedAt: '2026-11-18T04:00:00Z',
};

function show(product?: ProductResponse) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  const session = {
    user: { id: 'actor', name: 'Actor' },
    contextTag: 'verified',
    hasMemberships: true,
    currentStore: { storeId: 'shop', name: 'Shop', canEditProducts: true },
  } as unknown as SessionContext;
  client.setQueryData(sessionContextKey, session);
  client.setQueryData(productsKeys.categories('verified'), { items: [] });
  render(
    <QueryClientProvider client={client}>
      <ProductForm product={product} onSaved={vi.fn()} page={page} />
    </QueryClientProvider>,
  );
}

async function addValues(optionLabel: string, ...values: string[]) {
  for (const value of values) {
    const box = screen.getByLabelText(new RegExp(`^Add a value to ${optionLabel}`));
    await userEvent.type(box, `${value}{Enter}`);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Variants card', () => {
  it('shows plain stock, code and warn-at fields while a product has no options', () => {
    show(saved);
    const card = screen.getByRole('heading', { name: 'Variants' }).parentElement!;
    expect((within(card).getByLabelText('Stock') as HTMLInputElement).value).toBe('12');
    expect((within(card).getByLabelText(/Product code/) as HTMLInputElement).value).toBe('TS-1');
    expect(within(card).getByLabelText(/Warn me when stock is at/)).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Add options' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: /Suggest options/ })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('builds the grid as values are typed and moves the stock to the first value', async () => {
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: 'Add options' }));
    await userEvent.type(screen.getByLabelText('Option 1 name'), 'Size');
    await addValues('Size', 'S', 'M', 'L');
    const first = screen.getByLabelText('Stock for S') as HTMLInputElement;
    expect(first.value).toBe('12');
    expect((screen.getByLabelText('Code for S') as HTMLInputElement).value).toBe('TS-1');
    expect((screen.getByLabelText('Stock for M') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Cost for L') as HTMLInputElement).value).toBe('650.00');
  });

  it('suggests common sizes and groups rows by the first option', async () => {
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: 'Add options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Colour' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Black' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add White' }));
    await userEvent.click(screen.getByRole('button', { name: /Add option/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Size' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add S' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add M' }));
    const black = screen.getByRole('region', { name: 'Black variants' });
    expect(within(black).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(within(black).getByRole('button', { name: /^Black2 variants/ }));
    expect(within(black).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'White variants' })).toBeTruthy();
  });

  it('sets a price on the chosen rows and keeps removed rows out until asked', async () => {
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: 'Add options' }));
    await userEvent.type(screen.getByLabelText('Option 1 name'), 'Size');
    await addValues('Size', 'S', 'M', 'L');
    await userEvent.click(screen.getByLabelText('Select S'));
    await userEvent.click(screen.getByLabelText('Select M'));
    await userEvent.click(screen.getByRole('button', { name: 'Set price' }));
    await userEvent.type(screen.getByLabelText('Set price'), '1300{Enter}');
    expect((screen.getByLabelText('Price for S') as HTMLInputElement).value).toBe('1300');
    expect((screen.getByLabelText('Price for L') as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByLabelText('Price for S')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Add missing combinations \(2\)/ }));
    expect(screen.getByLabelText('Price for S')).toBeTruthy();
  });

  it('fills the grid from a spreadsheet paste', async () => {
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: 'Add options' }));
    await userEvent.type(screen.getByLabelText('Option 1 name'), 'Size');
    await addValues('Size', 'S', 'M');
    await userEvent.click(screen.getByLabelText('Price for S'));
    await userEvent.paste('1,200\t650\n1,300\t700');
    expect((screen.getByLabelText('Price for M') as HTMLInputElement).value).toBe('1300');
    expect((screen.getByLabelText('Cost for M') as HTMLInputElement).value).toBe('700');
    expect(screen.getByLabelText('Profit for S').textContent).toContain('46%');
  });

  it('adds nothing from AI suggestions until the seller taps Add all', async () => {
    vi.stubGlobal('fetch', async (path: string) => {
      expect(path).toContain('/products/suggest-options');
      return Response.json(
        { options: [{ name: 'Size', values: ['S', 'M', 'L'] }] },
        { headers: { 'x-session-context': 'verified' } },
      );
    });
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: /Suggest options/ }));
    await screen.findByText('Suggested from the title and photos');
    expect(screen.queryByLabelText('Price for S')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove suggested L' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add all' }));
    await waitFor(() => expect(screen.getByLabelText('Stock for S')).toBeTruthy());
    expect(screen.queryByLabelText('Stock for L')).toBeNull();
  });

  it('falls back to common options when the AI has nothing', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ options: [] }, { headers: { 'x-session-context': 'verified' } }),
    );
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: /Suggest options/ }));
    expect(await screen.findByText('Common options to start from')).toBeTruthy();
  });

  it('asks for one reason on save and writes the stock difference to the history', async () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    const calls: { path: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json(saved, { headers: { 'x-session-context': 'verified' } });
    });
    show(saved);
    const stock = screen.getByLabelText('Stock');
    await userEvent.clear(stock);
    await userEvent.type(stock, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await userEvent.type(await screen.findByLabelText('Reason'), 'Counted the shelf');
    await userEvent.click(screen.getByRole('button', { name: 'Save with this reason' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]?.path).toContain(`/products/${saved.id}`);
    expect(calls[1]).toMatchObject({
      path: expect.stringContaining(`/variants/${saved.variants[0]!.id}/stock-adjustments`),
      body: { quantity: -3, reason: 'Counted the shelf' },
    });
  });
});
