// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProductListQuery, ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { productsKeys } from '../api/products';
import { ProductsScreen } from './products-screen';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }) }));
const product: ProductResponse = {
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  name: 'Cotton Panjabi',
  description: null,
  category: 'Men',
  aliases: [],
  pricePoisha: 245000,
  compareAtPricePoisha: 295000,
  options: [],
  isStockTracked: true,
  isVisibleInChats: true,
  isVisibleInOrderLink: true,
  status: 'active',
  imageFileIds: [],
  photos: [],
  readiness: ['needs_photo', 'running_low'],
  variants: [
    {
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae3',
      title: 'Default',
      optionValues: {},
      sku: null,
      costPoisha: null,
      priceOverridePoisha: null,
      pricePoisha: 245000,
      isDefault: true,
      onHand: 5,
      reserved: 2,
      available: 3,
    },
  ],
  createdAt: '2026-11-17T08:00:00Z',
  updatedAt: '2026-11-17T08:00:00Z',
};
const response = (body: unknown) =>
  Response.json(body, { headers: { 'x-session-context': 'verified' } });
function show(
  query: ProductListQuery = { limit: 50 },
  {
    edit = true,
    view = true,
    adjust,
    productId,
    create,
  }: { edit?: boolean; view?: boolean; adjust?: string; productId?: string; create?: '1' } = {},
) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: SessionContext = {
    user: { id: 'actor', name: 'Actor' },
    hasMemberships: true,
    contextTag: 'verified',
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewProducts: view,
      canEditProducts: edit,
      canViewOrders: false,
      canEditOrders: false,
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
  client.setQueryData(sessionContextKey, context);
  const content = () => (
    <QueryClientProvider client={client}>
      <ProductsScreen query={query} adjust={adjust} productId={productId} create={create} />
    </QueryClientProvider>
  );
  const rendered = render(content());
  push.mockImplementation((href: string) => {
    const parameters = new URL(href, 'http://localhost').searchParams;
    adjust = parameters.get('adjust') ?? undefined;
    productId = parameters.get('product') ?? undefined;
    create = parameters.get('create') === '1' ? '1' : undefined;
    rendered.rerender(content());
  });
  return { client, ...rendered };
}
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
  push.mockReset();
});

describe('Products screen', () => {
  it('shows the loading state while products are requested', () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    show();
    expect(screen.getByRole('status').textContent).toContain('Loading products');
  });
  it('shows effective prices, available stock and readiness without unsupported counts or edit controls', async () => {
    vi.stubGlobal('fetch', async () => response({ items: [product], nextCursor: null }));
    show({ limit: 50 }, { edit: false, adjust: product.variants[0]!.id });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('৳2,450')).toBeTruthy();
    expect(within(table).getByText('৳2,950').tagName).toBe('DEL');
    expect(within(table).getByText('Default: 3')).toBeTruthy();
    expect(within(table).getByText('Needs a photo')).toBeTruthy();
    expect(within(table).getByText('Running low')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Adjust stock/ })).toBeNull();
    expect(screen.queryByText(/asked|Best seller|Stock value/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Import|AI/ })).toBeNull();
  });
  it('hides the screen without product access', () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('No product access');
    });
    show({ limit: 50 }, { edit: false, view: false });
    expect(screen.getByRole('status').textContent).toContain('You do not have access');
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('shows an empty state and retries a failed request', async () => {
    let failed = true;
    vi.stubGlobal('fetch', async () =>
      failed
        ? Response.json(
            { error: { code: 'UNAVAILABLE', message: 'Products could not load' } },
            { status: 503 },
          )
        : response({ items: [], nextCursor: null }),
    );
    show();
    expect((await screen.findByRole('alert')).textContent).toContain('Products could not load');
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry products' }));
    expect(await screen.findByText('No products on this page.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(
      '/products',
    );
  });
  it('keeps search and readiness in cursor links and clears the cursor when filters change', async () => {
    const cursor = '019c01ea-cf15-7d31-a7f5-d73d66007ae4';
    let requested = '';
    vi.stubGlobal('fetch', async (path: string) => {
      requested = path;
      return response({ items: [product], nextCursor: cursor });
    });
    show({ limit: 50, search: 'Cotton', readiness: 'running_low', cursor: product.id });
    const next = await screen.findByRole('link', { name: 'Next page' });
    expect(new URL(requested, 'http://localhost').searchParams.get('cursor')).toBe(product.id);
    const nextQuery = new URL(next.getAttribute('href')!, 'http://localhost').searchParams;
    expect(nextQuery.get('cursor')).toBe(cursor);
    expect(nextQuery.get('search')).toBe('Cotton');
    expect(nextQuery.get('readiness')).toBe('running_low');
    const allQuery = new URL(
      screen.getByRole('link', { name: 'All' }).getAttribute('href')!,
      'http://localhost',
    ).searchParams;
    expect(allQuery.get('cursor')).toBeNull();
    expect(allQuery.get('search')).toBe('Cotton');
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search products' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(push).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), 'c');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const searchQuery = new URL(push.mock.calls[0]![0], 'http://localhost').searchParams;
    expect(searchQuery.get('search')).toBe('abc');
    expect(searchQuery.get('readiness')).toBe('running_low');
    expect(searchQuery.get('cursor')).toBeNull();
  });
  it('opens a selected variant from the address and clears it on close', async () => {
    vi.stubGlobal('fetch', async () => response({ items: [product], nextCursor: null }));
    show({ limit: 50 }, { adjust: product.variants[0]!.id });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      new URL(push.mock.calls.at(-1)![0], 'http://localhost').searchParams.get('adjust'),
    ).toBeNull();
  });
  it('refreshes stock counts without replacing an open adjustment draft', async () => {
    let refreshed = false;
    vi.stubGlobal('fetch', async () =>
      response({
        items: [
          {
            ...product,
            variants: [
              { ...product.variants[0]!, onHand: refreshed ? 8 : 5, available: refreshed ? 6 : 3 },
            ],
          },
        ],
        nextCursor: null,
      }),
    );
    const { client } = show();
    await screen.findByRole('table');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Adjust stock for Cotton Panjabi, Default' })[0]!,
    );
    await userEvent.type(screen.getByLabelText('Reason'), 'Keep the count draft');
    refreshed = true;
    await client.refetchQueries({ queryKey: productsKeys.all });
    expect(
      await within(screen.getByRole('dialog')).findByText(
        'On hand: 8 · Reserved: 2 · Available: 6',
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe(
      'Keep the count draft',
    );
  });
  it('adjusts one variant with a reason and refreshes the available stock', async () => {
    let changed = false;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      if (init.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          quantity: 2,
          reason: 'Counted new delivery',
        });
        expect(new Headers(init.headers).get('X-Session-Context')).toBe('verified');
        changed = true;
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return response({
        items: [
          {
            ...product,
            variants: [
              { ...product.variants[0]!, onHand: changed ? 7 : 5, available: changed ? 5 : 3 },
            ],
          },
        ],
        nextCursor: null,
      });
    });
    show();
    await screen.findByRole('table');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Adjust stock for Cotton Panjabi, Default' })[0]!,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('On hand: 5 · Reserved: 2 · Available: 3')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Change in stock'), '2');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Counted new delivery');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save stock' }));
    expect(await within(screen.getByRole('table')).findByText('Default: 5')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps rejected adjustments and their error visible', async () => {
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) =>
      init.method === 'POST'
        ? Response.json(
            { error: { code: 'STOCK_NOT_AVAILABLE', message: 'Not enough available stock' } },
            { status: 409, headers: { 'x-session-context': 'verified' } },
          )
        : response({ items: [product], nextCursor: null }),
    );
    show();
    await screen.findByRole('table');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Adjust stock for Cotton Panjabi, Default' })[0]!,
    );
    await userEvent.type(screen.getByLabelText('Change in stock'), '-10');
    await userEvent.type(screen.getByLabelText('Reason'), 'Damaged');
    await userEvent.click(screen.getByRole('button', { name: 'Save stock' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not enough available stock');
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('Damaged');
  });
});

describe('Product editor navigation', () => {
  it('opens creation from the list and selects the saved product', async () => {
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) =>
      init.method === 'POST' || path === `/api/products/${product.id}`
        ? response(product)
        : response({ items: [product], nextCursor: null }),
    );
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Cotton Panjabi');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save as hidden' }));
    expect(await screen.findByRole('dialog', { name: product.name })).toBeTruthy();
    expect(
      new URL(push.mock.calls.at(-1)![0], 'http://localhost').searchParams.get('product'),
    ).toBe(product.id);
  });

  it('shows a saved product to viewers without edit or upload controls', async () => {
    vi.stubGlobal('fetch', async (path: string) =>
      response(
        path === `/api/products/${product.id}` ? product : { items: [product], nextCursor: null },
      ),
    );
    show({ limit: 50 }, { edit: false, productId: product.id });
    const dialog = await screen.findByRole('dialog', { name: product.name });
    expect(within(dialog).getByText('৳2,450')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Edit product' })).toBeNull();
    expect(within(dialog).queryByLabelText('Add photo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
  });

  it('shows the effective variant price when the product base price is zero', async () => {
    const priced = {
      ...product,
      pricePoisha: 0,
      variants: [{ ...product.variants[0]!, priceOverridePoisha: 45025, pricePoisha: 45025 }],
    };
    vi.stubGlobal('fetch', async (path: string) =>
      response(
        path === `/api/products/${product.id}` ? priced : { items: [priced], nextCursor: null },
      ),
    );
    show({ limit: 50 }, { productId: product.id, edit: false });
    const dialog = await screen.findByRole('dialog', { name: product.name });
    expect(within(dialog).getByText('৳450.25')).toBeTruthy();
  });

  it('retries a failed selected product without losing its address', async () => {
    let failed = true;
    vi.stubGlobal('fetch', async (path: string) => {
      if (path === `/api/products/${product.id}`)
        return failed
          ? Response.json(
              { error: { code: 'UNAVAILABLE', message: 'Product could not load' } },
              { status: 503 },
            )
          : response(product);
      return response({ items: [], nextCursor: null });
    });
    show({ limit: 50 }, { productId: product.id });
    expect((await screen.findByRole('alert')).textContent).toContain('Product could not load');
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry product' }));
    expect(await screen.findByRole('dialog', { name: product.name })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
