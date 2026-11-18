// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProductSchema, type ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { ProductForm } from './product-form';
import { sessionContextKey } from '@/lib/session-context';

const product: ProductResponse = {
  ...createProductSchema.parse({ name: 'Cotton Panjabi', pricePoisha: 245050, status: 'hidden' }),
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  imageFileIds: [],
  photos: [],
  readiness: ['hidden', 'needs_photo'],
  variants: [
    {
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae3',
      optionValues: {},
      sku: 'PAN-M',
      priceOverridePoisha: null,
      costPoisha: 120075,
      title: 'Default',
      isDefault: true,
      pricePoisha: 245050,
      onHand: 5,
      reserved: 2,
      available: 3,
    },
  ],
  createdAt: '2026-11-18T04:00:00Z',
  updatedAt: '2026-11-18T04:00:00Z',
};

function show(initial?: ProductResponse) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const session: SessionContext = {
    user: { id: 'actor', name: 'Actor' },
    contextTag: 'verified',
    hasMemberships: true,
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewProducts: true,
      canEditProducts: true,
      canViewCustomers: false,
      canCreateCustomer: false,
      canViewSegments: false,
      canEditSegments: false,
      canApproveSupport: false,
      canViewStoreSettings: false,
      canEditStoreSettings: false,
      canChangeExtensions: false,
      canViewTeam: false,
      canEditTeam: false,
      canTransferOwnership: false,
    },
  };
  client.setQueryData(sessionContextKey, session);
  const onSaved = vi.fn();
  const tree = (current?: ProductResponse) => (
    <QueryClientProvider client={client}>
      <ProductForm product={current} onSaved={onSaved} />
    </QueryClientProvider>
  );
  const rendered = render(tree(initial));
  return { onSaved, refresh: (current: ProductResponse) => rendered.rerender(tree(current)) };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Product form', () => {
  it.each([
    ['Save as hidden', 'hidden'],
    ['Save and show', 'active'],
  ])('creates through %s with integer poisha', async (label, status) => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('X-Session-Context')).toBe('verified');
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show();
    await userEvent.type(screen.getByLabelText('Name'), 'Cotton Panjabi');
    await userEvent.clear(screen.getByLabelText('Selling price (Taka)'));
    await userEvent.type(screen.getByLabelText('Selling price (Taka)'), '2450.50');
    await userEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product));
    expect(submitted).toMatchObject({ name: 'Cotton Panjabi', pricePoisha: 245050, status });
  });

  it('saves an existing hidden product without changing its variant identity or stock', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      expect(init.method).toBe('PATCH');
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(product);
    expect((screen.getByLabelText('Selling price (Taka)') as HTMLInputElement).value).toBe(
      '2450.50',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product));
    expect(submitted).toMatchObject({
      status: 'hidden',
      variants: [{ id: product.variants[0]!.id, sku: 'PAN-M', costPoisha: 120075 }],
    });
    expect(JSON.stringify(submitted)).not.toMatch(/onHand|reserved|available/);
  });

  it.each(['Fit', ' Fit '])(
    'renames an option to %s without replacing a saved variant',
    async (name) => {
      let submitted: unknown;
      const withOption: ProductResponse = {
        ...product,
        options: [{ name: 'Size', values: ['M'] }],
        variants: [
          { ...product.variants[0]!, title: 'M', isDefault: false, optionValues: { Size: 'M' } },
        ],
      };
      vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
        submitted = JSON.parse(String(init.body));
        return Response.json(withOption, { headers: { 'x-session-context': 'verified' } });
      });
      const { onSaved } = show(withOption);
      await userEvent.clear(screen.getByLabelText('Option 1 name'));
      await userEvent.type(screen.getByLabelText('Option 1 name'), name);
      await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(submitted).toMatchObject({
        options: [{ name: 'Fit', values: ['M'] }],
        variants: [{ id: product.variants[0]!.id, optionValues: { Fit: 'M' }, sku: 'PAN-M' }],
      });
    },
  );

  it('shows and saves option names containing punctuation as flat option keys', async () => {
    const withOption: ProductResponse = {
      ...product,
      options: [{ name: 'Size (U.S.)', values: ['M'] }],
      variants: [
        {
          ...product.variants[0]!,
          title: 'M',
          isDefault: false,
          optionValues: { 'Size (U.S.)': 'M' },
        },
      ],
    };
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(withOption, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(withOption);
    expect(
      screen.getByRole('combobox', { name: 'Size (U.S.) for variant 1' }).textContent,
    ).toContain('M');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({ variants: [{ optionValues: { 'Size (U.S.)': 'M' } }] });
  });

  it('keeps separate aliases when another name is entered on a new line', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(product);
    await userEvent.type(screen.getByLabelText('Other names'), 'পাঞ্জাবি{Enter}Panjabi');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({ aliases: ['পাঞ্জাবি', 'Panjabi'] });
  });

  it('keeps unsaved values through refresh and a rejected save', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: { code: 'PRODUCT_SKU_TAKEN', message: 'That product code is already in use' } },
        { status: 409, headers: { 'x-session-context': 'verified' } },
      ),
    );
    const { refresh } = show(product);
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'My unsaved name');
    refresh({ ...product, name: 'Another saved name' });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('My unsaved name');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already in use');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('My unsaved name');
  });
});
