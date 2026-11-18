// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('keeps aliases and channel settings in the saved-product editor', () => {
    show();
    expect(screen.queryByLabelText('Other names')).toBeNull();
    expect(screen.queryByLabelText('Show in chat replies')).toBeNull();
    expect(screen.getByLabelText('Track stock')).toBeTruthy();
  });

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
    await userEvent.type(screen.getByLabelText('Product code'), '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product));
    expect(submitted).toMatchObject({
      variants: [{ id: product.variants[0]!.id, sku: 'PAN-M-1', costPoisha: 120075 }],
    });
    expect(JSON.stringify(submitted)).not.toMatch(/status|onHand|reserved|available/);
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
      (screen.getByRole('combobox', { name: 'Size (U.S.) for variant 1' }) as HTMLSelectElement)
        .value,
    ).toBe('M');
    await userEvent.type(screen.getByLabelText('Product code for variant 1'), '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({ variants: [{ optionValues: { 'Size (U.S.)': 'M' } }] });
  });

  it('preserves both variant choices when an option name briefly matches another', async () => {
    const withOptions: ProductResponse = {
      ...product,
      options: [
        { name: 'Size', values: ['M'] },
        { name: 'S', values: ['Silk'] },
      ],
      variants: [
        { ...product.variants[0]!, isDefault: false, optionValues: { Size: 'M', S: 'Silk' } },
      ],
    };
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(withOptions, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(withOptions);
    const name = screen.getByLabelText('Option 1 name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Size type');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({
      variants: [{ id: product.variants[0]!.id, optionValues: { 'Size type': 'M', S: 'Silk' } }],
    });
  });

  it('saves a description without overwriting later visibility or variant changes', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved, refresh } = show({ ...product, status: 'active' });
    await userEvent.type(screen.getByLabelText('Description'), 'Made with cotton');
    refresh(product);
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toEqual({ description: 'Made with cotton' });
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

  it('shows which textarea contains an invalid alias', async () => {
    show(product);
    const aliases = screen.getByLabelText('Other names');
    fireEvent.change(aliases, { target: { value: 'Scarf\n' + 'A'.repeat(201) } });
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect((await screen.findByRole('alert')).textContent).toContain('200');
    expect(aliases.getAttribute('aria-invalid')).toBe('true');
  });

  it('lets an existing default variant return from its override to the product price', async () => {
    const overridden = {
      ...product,
      pricePoisha: 0,
      variants: [{ ...product.variants[0]!, priceOverridePoisha: 45025, pricePoisha: 45025 }],
    };
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(overridden);
    const override = screen.getByLabelText('Default price override (Taka)');
    expect((override as HTMLInputElement).value).toBe('450.25');
    await userEvent.clear(override);
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({
      variants: [{ id: product.variants[0]!.id, priceOverridePoisha: null }],
    });
  });

  it('shows an option-combination error before submitting duplicate default variants', async () => {
    const optioned = {
      ...product,
      options: [{ name: 'Size', values: ['M', 'L'] }],
      variants: [
        { ...product.variants[0]!, isDefault: false, optionValues: { Size: 'M' } },
        {
          ...product.variants[0]!,
          id: '019c01ea-cf15-7d31-a7f5-d73d66007ae4',
          isDefault: false,
          optionValues: { Size: 'L' },
        },
      ],
    };
    let submitted = false;
    vi.stubGlobal('fetch', async () => {
      submitted = true;
      return Response.json(product);
    });
    show(optioned);
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect((await screen.findByRole('alert')).textContent).toContain('distinct variants');
    expect(submitted).toBe(false);
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
