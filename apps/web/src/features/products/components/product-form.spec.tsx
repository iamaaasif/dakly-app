// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProductSchema, type ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { clearProductDraft } from '../use-product-draft';
import { ProductForm } from './product-form';
import { productsKeys } from '@/lib/product-query-keys';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn() }),
}));

const product: ProductResponse = {
  source: 'manual',
  code: null,
  ...createProductSchema.parse({ name: 'Cotton Panjabi', pricePoisha: 245050, status: 'hidden' }),
  version: 1,
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  category: null,
  brand: null,
  imageFileIds: [],
  photos: [],
  readiness: ['hidden', 'needs_photo'],
  variants: [
    {
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae3',
      imageFileIds: [],
      photos: [],
      optionValues: {},
      sku: 'PAN-M',
      priceOverridePoisha: null,
      lowStockThreshold: null,
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

function show(
  initial?: ProductResponse,
  page?: ComponentProps<typeof ProductForm>['page'],
  extras: {
    duplicateSource?: ProductResponse;
    photos?: ComponentProps<typeof ProductForm>['photos'];
  } = {},
) {
  const { duplicateSource, photos } = extras;
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
  const session: SessionContext = {
    user: { id: 'actor', name: 'Actor' },
    contextTag: 'verified',
    hasMemberships: true,
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewProducts: true,
      canEditProducts: true,
      canViewOrders: false,
      canEditOrders: false,
      canExportOrders: false,
      canPrintShippingLabels: false,
      canViewDueBook: false,
      canEditDueBook: false,
      canViewCampaigns: false,
      canViewAnalytics: false,
      canChangeAttributionWindow: false,
      canEditCampaigns: false,
      canViewSocial: false,
      canEditSocial: false,
      canViewAutomations: false,
      canEditAutomations: false,
      canViewCustomers: false,
      canCreateCustomer: false,
      canExportCustomers: false,
      canViewChats: false,
      canEditChats: false,
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
  client.setQueryData(productsKeys.categories(session.contextTag), { items: [] });
  client.setQueryData(productsKeys.brands(session.contextTag), { items: [] });
  const onSaved = vi.fn();
  const tree = (current?: ProductResponse) => (
    <QueryClientProvider client={client}>
      <ProductForm
        product={current}
        onSaved={onSaved}
        page={page}
        duplicateSource={duplicateSource}
        photos={photos}
      />
    </QueryClientProvider>
  );
  const rendered = render(tree(initial));
  return { onSaved, refresh: (current: ProductResponse) => rendered.rerender(tree(current)) };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('Product form on a full page', () => {
  const page = {
    title: 'New product',
    backHref: '/products',
    photos: <p>Save the product to add photos.</p>,
    status: <p>Hidden</p>,
  };

  it('keeps the save buttons in the top bar beside the photos and status', () => {
    show(undefined, page);
    expect(screen.getByRole('heading', { name: 'New product' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to products' }).getAttribute('href')).toBe(
      '/products',
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByText('Save the product to add photos.')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    for (const title of [
      'Price',
      'Variations',
      'Inventory management',
      'Organisation',
      'Packaging',
      'Where it appears',
    ])
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
  });

  it.each([
    [null, '2,450.50', ''],
    [300000, '3,000', '2,450.50'],
  ])(
    'loads the regular and sale price with an old price of %s',
    (compareAtPricePoisha, regular, sale) => {
      show({ ...product, compareAtPricePoisha }, page);
      expect(screen.getByLabelText<HTMLInputElement>('Regular price').value).toBe(regular);
      expect(screen.getByLabelText<HTMLInputElement>('Sell price').value).toBe(sale);
    },
  );

  it.each([
    ['', 300025, null],
    ['2450.50', 245050, 300025],
  ])(
    'saves the regular price and a sell price of %s',
    async (sale, pricePoisha, compareAtPricePoisha) => {
      let submitted: unknown;
      vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
        submitted = JSON.parse(String(init.body));
        return Response.json(product, { headers: { 'x-session-context': 'verified' } });
      });
      const { onSaved } = show(undefined, page);
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: product.name } });
      fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '3000.25' } });
      fireEvent.change(screen.getByLabelText('Sell price'), { target: { value: sale } });
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(submitted).toMatchObject({ pricePoisha, compareAtPricePoisha, status: 'hidden' });
    },
  );

  it('attaches the photos uploaded before Create, in order', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const ids = ['019c01ea-cf15-7d31-a7f5-d73d66007b01', '019c01ea-cf15-7d31-a7f5-d73d66007b02'];
    const { onSaved } = show(undefined, page, {
      photos: { fileIds: ids, uploading: 0, failed: 0 },
    });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: product.name } });
    fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '300' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({ imageFileIds: ids });
  });

  it('waits for photos that are still uploading and blocks Create after a failed one', async () => {
    const { onSaved } = show(undefined, page, { photos: { fileIds: [], uploading: 2, failed: 0 } });
    const button = screen.getByRole('button', { name: 'Uploading 2 photos…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    show(undefined, page, { photos: { fileIds: [], uploading: 0, failed: 1 } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: product.name } });
    fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '300' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText(/A photo did not upload/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('takes 1,850 or 1850 as the same price and groups the digits when you leave the field', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(undefined, page);
    const regular = screen.getByLabelText<HTMLInputElement>('Regular price');
    await userEvent.type(regular, '1,850');
    expect(regular.value).toBe('1,850');
    await userEvent.tab();
    expect(regular.value).toBe('1,850');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: product.name } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({ pricePoisha: 185000 });
  });

  it('flags a sell price above the regular price while typing', async () => {
    show(undefined, page);
    fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Sell price'), { target: { value: '500' } });
    expect(await screen.findByText('Enter a sell price below the regular price.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sell price'), { target: { value: '300' } });
    await waitFor(() =>
      expect(screen.queryByText('Enter a sell price below the regular price.')).toBeNull(),
    );
  });

  it('says what the AI will do with the opening offer and the minimum price', async () => {
    show(undefined, page);
    fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '2000' } });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eligible AI negotiation' }));
    fireEvent.change(screen.getByLabelText('Opening offer price'), { target: { value: '1800' } });
    fireEvent.change(screen.getByLabelText('Min price'), { target: { value: '1650' } });
    expect(await screen.findByText(/^Opens at/)).toBeTruthy();
    expect(screen.getByText('৳1,800')).toBeTruthy();
    expect(screen.getByText('৳1,650')).toBeTruthy();
  });

  it('saves with Ctrl+S from anywhere on the page', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(product, { headers: { 'x-session-context': 'verified' } }),
    );
    const { onSaved } = show(undefined, page);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: product.name } });
    fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '300' } });
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('brings back a new product that was typed before a reload', async () => {
    window.sessionStorage.setItem(
      'dakly:new-product-draft:shop',
      JSON.stringify({ name: 'Linen shirt', pricePoisha: '950' }),
    );
    show(undefined, page);
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Linen shirt'),
    );
    expect(screen.getByText('Restored what you had typed before.')).toBeTruthy();
    window.sessionStorage.clear();
  });

  it('does not bring back a draft typed in another shop', async () => {
    window.sessionStorage.setItem(
      'dakly:new-product-draft:other-shop',
      JSON.stringify({ name: 'Other shop shirt', pricePoisha: '950' }),
    );
    show(undefined, page);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('');
    expect(screen.queryByText('Restored what you had typed before.')).toBeNull();
  });

  it('writes nothing after the draft is cleared while a write was waiting', async () => {
    vi.useFakeTimers();
    const clear = clearProductDraft;
    show(undefined, page);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Linen shirt' } });
    clear('shop');
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    expect(window.sessionStorage.getItem('dakly:new-product-draft:shop')).toBeNull();
  });

  it('clears the old price when an edit removes the sell price', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show({ ...product, compareAtPricePoisha: 300000 }, page);
    await userEvent.clear(screen.getByLabelText('Sell price'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toEqual({ pricePoisha: 300000, compareAtPricePoisha: null });
  });

  it('keeps an invalid kilogram amount in view and saves a valid amount as grams', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show({ ...product, weightGrams: 500 }, page);
    Element.prototype.scrollIntoView = () => undefined;
    screen.getByRole('combobox', { name: 'Weight unit' }).focus();
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}');
    const weight = screen.getByLabelText<HTMLInputElement>('Product weight');
    expect(weight.value).toBe('0.5');
    fireEvent.change(weight, { target: { value: '1.2345' } });
    expect(weight.value).toBe('1.2345');
    expect(screen.getByText('Enter the weight in kg, for example 0.5')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    fireEvent.change(weight, { target: { value: '1.25' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toEqual({ weightGrams: 1250 });
  });

  it('shows the product details without editing controls on a read-only page', () => {
    show(product, { ...page, readOnly: true });
    const name = screen.getByLabelText<HTMLInputElement>('Title');
    expect(name.value).toBe(product.name);
    expect(name.matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Eligible AI negotiation' })).toBeNull();
  });

  it('warns about selling below cost and still saves negotiation prices', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(product, page);
    const toggle = screen.getByRole('checkbox', { name: 'Eligible AI negotiation' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('Opening offer price'), {
      target: { value: '2000.50' },
    });
    fireEvent.change(screen.getByLabelText('Min price'), { target: { value: '1200.50' } });
    expect(screen.getByText('The lowest price is below the product cost.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toEqual({
      negotiationEnabled: true,
      negotiationOpeningPoisha: 200050,
      negotiationFloorPoisha: 120050,
    });
  });

  it('disables negotiation when the product has a variant with its own price', () => {
    show(
      { ...product, variants: [{ ...product.variants[0]!, priceOverridePoisha: 200000 }] },
      page,
    );
    expect(
      screen.getByRole<HTMLButtonElement>('checkbox', { name: 'Eligible AI negotiation' }).disabled,
    ).toBe(true);
    expect(screen.getByText('A variant has its own price.')).toBeTruthy();
  });

  it('compares the opening offer with the price the customer pays', async () => {
    const { onSaved } = show({ ...product, compareAtPricePoisha: 300000 }, page);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eligible AI negotiation' }));
    fireEvent.change(screen.getByLabelText('Opening offer price'), {
      target: { value: '2450.50' },
    });
    fireEvent.change(screen.getByLabelText('Min price'), { target: { value: '1800' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter an opening offer below the selling price.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects a sell price equal to the regular price', async () => {
    const { onSaved } = show(undefined, page);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: product.name } });
    fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Sell price'), { target: { value: '400' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Enter a sell price below the regular price.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Regular price'), { target: { value: '500' } });
    await waitFor(() =>
      expect(screen.queryByText('Enter a sell price below the regular price.')).toBeNull(),
    );
  });

  it('fills a new copy with the selling details and leaves stock and product codes blank', async () => {
    const writes: unknown[] = [];
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      if (init.method === 'POST') writes.push([path, JSON.parse(String(init.body))]);
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    show(undefined, page, {
      duplicateSource: {
        ...product,
        description: 'Handwoven cotton',
        status: 'active',
        compareAtPricePoisha: 295000,
        weightGrams: 1250,
        imageFileIds: ['original-photo'],
        variants: [{ ...product.variants[0]!, imageFileIds: ['original-variant-photo'] }],
      },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Cotton Panjabi copy');
    expect(screen.getByLabelText<HTMLInputElement>('Regular price').value).toBe('2,950');
    expect(screen.getByLabelText<HTMLInputElement>('Sell price').value).toBe('2,450.50');
    expect(writes).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual([
      '/api/products',
      expect.objectContaining({
        name: 'Cotton Panjabi copy',
        description: 'Handwoven cotton',
        pricePoisha: 245050,
        compareAtPricePoisha: 295000,
        weightGrams: 1250,
        status: 'hidden',
        variants: [
          {
            optionValues: {},
            sku: null,
            priceOverridePoisha: null,
            costPoisha: 120075,
            lowStockThreshold: null,
          },
        ],
      }),
    ]);
  });

  it('shows one Save product button for a saved product', () => {
    show(product, { ...page, title: 'Cotton Panjabi' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });
});

describe('Product form', () => {
  it('keeps aliases and channel settings in the saved-product editor', () => {
    show();
    expect(screen.queryByLabelText('Other names')).toBeNull();
    expect(screen.queryByLabelText('Show in chat replies')).toBeNull();
    expect(screen.getByLabelText('Track stock availability')).toBeTruthy();
  });

  it.each(['hidden', 'active'])('creates through %s with integer poisha', async (status) => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('X-Session-Context')).toBe('verified');
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show();
    await userEvent.type(screen.getByLabelText('Name'), 'Cotton Panjabi');
    await userEvent.clear(screen.getByLabelText('Selling price ৳'));
    await userEvent.type(screen.getByLabelText('Selling price ৳'), '2450.50');
    if (status === 'active') {
      Element.prototype.scrollIntoView = () => undefined;
      screen.getByRole('combobox', { name: 'Status' }).focus();
      await userEvent.keyboard('{Enter}{ArrowUp}{Enter}');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product, []));
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
    expect((screen.getByLabelText('Selling price ৳') as HTMLInputElement).value).toBe('2450.50');
    await userEvent.type(screen.getByLabelText('Product code'), '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product, []));
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
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({
      variants: [{ id: product.variants[0]!.id, optionValues: { 'Size type': 'M', S: 'Silk' } }],
    });
  });

  it('asks for a new variant selection after its only option value is replaced', async () => {
    const withOption: ProductResponse = {
      ...product,
      options: [{ name: 'Size', values: ['M'] }],
      variants: [{ ...product.variants[0]!, isDefault: false, optionValues: { Size: 'M' } }],
    };
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(withOption, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(withOption);
    const values = screen.getByLabelText('Option 1 values');
    const choice = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Size for variant 1' });
    fireEvent.change(values, { target: { value: ' M ' } });
    expect(choice.value).toBe('M');
    fireEvent.change(values, { target: { value: 'L' } });
    expect(choice.value).toBe('');
    await userEvent.selectOptions(choice, 'L');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({
      variants: [{ id: product.variants[0]!.id, optionValues: { Size: 'L' } }],
    });
  });

  it('picks a generated description without saving the product', async () => {
    const requests: { method: string | undefined; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      requests.push({ method: init.method, body: JSON.parse(String(init.body)) });
      const result =
        init.method === 'POST'
          ? { options: ['Made with cotton', 'Cotton for everyday wear', 'A cotton panjabi'] }
          : product;
      return Response.json(result, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show(product);
    fireEvent.click(screen.getByRole('button', { name: 'Write with AI' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Bangla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write 3 options' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Made with cotton' }));
    expect(screen.getByLabelText<HTMLTextAreaElement>('Description').value).toBe(
      'Made with cotton',
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(requests).toEqual([{ method: 'POST', body: { tone: 'friendly', language: 'bn' } }]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product, []));
    expect(requests.at(-1)).toEqual({ method: 'PATCH', body: { description: 'Made with cotton' } });
  });

  it('keeps a writing request pending when the panel is closed and reopened', async () => {
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal('fetch', () => response);
    show(product);
    const toggle = screen.getByRole('button', { name: 'Write with AI' });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Write 3 options' }));
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Write 3 options' }).disabled,
      ).toBe(true),
    );
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Write 3 options' }).disabled,
    ).toBe(true);
    finish(
      Response.json(
        { options: ['Made with cotton', 'Cotton for everyday wear', 'A cotton panjabi'] },
        { headers: { 'x-session-context': 'verified' } },
      ),
    );
    await screen.findByRole('button', { name: 'Made with cotton' });
  });

  it('saves a description without overwriting later visibility or variant changes', async () => {
    let submitted: unknown;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved, refresh } = show({ ...product, status: 'active' });
    await userEvent.type(screen.getByLabelText('Description'), 'Made with cotton');
    refresh({
      ...product,
      version: 2,
      variants: product.variants.map((variant) => ({ ...variant, onHand: 6, available: 4 })),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitted).toMatchObject({ aliases: ['পাঞ্জাবি', 'Panjabi'] });
  });

  it('shows which textarea contains an invalid alias', async () => {
    show(product);
    const aliases = screen.getByLabelText('Other names');
    fireEvent.change(aliases, { target: { value: 'Scarf\n' + 'A'.repeat(201) } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('200');
    expect(aliases.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows one selling price for a saved simple product without an override', () => {
    show(product);
    expect(screen.getByLabelText('Selling price ৳')).toBeTruthy();
    expect(screen.queryByLabelText('Default price override (Taka)')).toBeNull();
  });

  it('keeps an entered variant override visible when the last option is removed', async () => {
    show(product);
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    await userEvent.type(screen.getByLabelText('Price override for variant 1 (Taka)'), '450');
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 1' }));
    const override = screen.getByLabelText<HTMLInputElement>('Default price override (Taka)');
    expect(override.value).toBe('450');
    await userEvent.clear(override);
    await userEvent.type(override, '500');
    expect(screen.getByLabelText<HTMLInputElement>('Default price override (Taka)').value).toBe(
      '500',
    );
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('must be different');
    expect(submitted).toBe(false);
  });

  it('keeps a cost typed before choosing sizes and applies it to every size', async () => {
    const bodies: { variants: { costPoisha: number | null }[] }[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') bodies.push(JSON.parse(String(init.body)));
      return Response.json(product, { headers: { 'x-session-context': 'verified' } });
    });
    const { onSaved } = show();
    await userEvent.type(screen.getByLabelText('Name'), 'T-Shirt');
    await userEvent.type(screen.getByLabelText('Selling price ৳'), '500');
    await userEvent.type(screen.getByLabelText('Your cost ৳'), '300');
    await userEvent.click(screen.getByRole('button', { name: 'S, M, L, XL' }));
    expect((screen.getByLabelText('Your cost ৳') as HTMLInputElement).value).toBe('300');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodies[0]!.variants.map((variant) => variant.costPoisha)).toEqual([
      30000, 30000, 30000, 30000,
    ]);
  });

  it('adjusts stock only for retained sizes after deleting a size row', async () => {
    const savedProduct: ProductResponse = {
      ...product,
      options: [{ name: 'Size', values: ['L'] }],
      variants: [
        {
          ...product.variants[0]!,
          id: '019c01ea-cf15-7d31-a7f5-d73d66007ae5',
          optionValues: { Size: 'L' },
        },
      ],
    };
    const adjustments: unknown[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (url.includes('/stock-adjustments')) {
          adjustments.push({ url, body: JSON.parse(String(init.body)) });
          return Response.json({ id: 'adj-1' }, { headers: { 'x-session-context': 'verified' } });
        }
        return Response.json(savedProduct, { headers: { 'x-session-context': 'verified' } });
      }
      return Response.json(savedProduct, { headers: { 'x-session-context': 'verified' } });
    });

    const { onSaved } = show();
    await userEvent.type(screen.getByLabelText('Name'), 'T-Shirt');

    await userEvent.click(screen.getByRole('button', { name: 'Add size' }));
    await userEvent.type(screen.getByLabelText('Size 1'), 'M');
    await userEvent.type(screen.getByLabelText('Stock for size M'), '5');

    await userEvent.click(screen.getByRole('button', { name: 'Add size' }));
    await userEvent.type(screen.getByLabelText('Size 2'), 'L');
    await userEvent.type(screen.getByLabelText('Stock for size L'), '3');

    await userEvent.click(screen.getByLabelText('Delete size M'));

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedProduct, []));
    expect(adjustments).toEqual([
      {
        url: '/api/variants/019c01ea-cf15-7d31-a7f5-d73d66007ae5/stock-adjustments',
        body: { quantity: 3, reason: 'Initial stock' },
      },
    ]);
  });

  it('reports failed initial stock adjustments with the failed size names', async () => {
    const savedProduct: ProductResponse = {
      ...product,
      options: [{ name: 'Size', values: ['L'] }],
      variants: [
        {
          ...product.variants[0]!,
          id: '019c01ea-cf15-7d31-a7f5-d73d66007ae5',
          optionValues: { Size: 'L' },
        },
      ],
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (url.includes('/stock-adjustments')) {
          return Response.json(
            { error: { message: 'Stock adjustment failed' } },
            { status: 500, headers: { 'x-session-context': 'verified' } },
          );
        }
        return Response.json(savedProduct, { headers: { 'x-session-context': 'verified' } });
      }
      return Response.json(savedProduct, { headers: { 'x-session-context': 'verified' } });
    });

    const { onSaved } = show();
    await userEvent.type(screen.getByLabelText('Name'), 'T-Shirt');
    await userEvent.click(screen.getByRole('button', { name: 'Add size' }));
    await userEvent.type(screen.getByLabelText('Size 1'), 'L');
    await userEvent.type(screen.getByLabelText('Stock for size L'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedProduct, ['L']));
  });

  it('saves with no stock adjustment when stock box is cleared', async () => {
    const savedProduct: ProductResponse = {
      ...product,
      options: [{ name: 'Size', values: ['M'] }],
      variants: [
        {
          ...product.variants[0]!,
          id: '019c01ea-cf15-7d31-a7f5-d73d66007ae5',
          optionValues: { Size: 'M' },
        },
      ],
    };
    const adjustments: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (url.includes('/stock-adjustments')) {
          adjustments.push({ url, body: JSON.parse(init.body as string) });
          return Response.json({}, { status: 201, headers: { 'x-session-context': 'verified' } });
        }
        return Response.json(savedProduct, { headers: { 'x-session-context': 'verified' } });
      }
      return Response.json(savedProduct, { headers: { 'x-session-context': 'verified' } });
    });

    const { onSaved } = show();
    await userEvent.type(screen.getByLabelText('Name'), 'T-Shirt');
    await userEvent.click(screen.getByRole('button', { name: 'Add size' }));
    await userEvent.type(screen.getByLabelText('Size 1'), 'M');
    const stockInput = screen.getByLabelText('Stock for size M');
    await userEvent.type(stockInput, '5');
    await userEvent.clear(stockInput);
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedProduct, []));
    expect(adjustments).toEqual([]);
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already in use');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('My unsaved name');
  });
});
