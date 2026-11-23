// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProductListQuery, ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { ProductsScreen } from './products-screen';
import { productsKeys } from '@/lib/product-query-keys';
import { sessionContextKey } from '@/lib/session-context';

// The screen also asks for undoable bulk edits; these tests are about the list.
function stubFetch(handler: (path: string, init: RequestInit) => unknown) {
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) =>
    String(path).includes('/products/bulk-edits')
      ? Promise.resolve(
          Response.json({ items: [] }, { headers: { 'x-session-context': 'verified' } }),
        )
      : handler(path, init ?? {}),
  );
}

const push = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: navigate }),
}));
vi.mock('@/lib/use-url-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUrlRouter: () => ({ push: push, replace: push }),
}));
const product: ProductResponse = {
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  name: 'Cotton Panjabi',
  description: null,
  category: 'Men',
  weightGrams: null,
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
      imageFileIds: [],
      photos: [],
      title: 'Default',
      optionValues: {},
      sku: null,
      lowStockThreshold: null,
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
  }: {
    edit?: boolean;
    view?: boolean;
    adjust?: string;
  } = {},
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
  client.setQueryData(sessionContextKey, context);
  client.setQueryData(productsKeys.categories(context.contextTag), { items: ['Cotton'] });
  const content = () => (
    <QueryClientProvider client={client}>
      <ProductsScreen query={query} adjust={adjust} />
    </QueryClientProvider>
  );
  const rendered = render(content());
  push.mockImplementation((href: string) => {
    const parameters = new URL(href, 'http://localhost').searchParams;
    adjust = parameters.get('adjust') ?? undefined;
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
  navigate.mockReset();
});

describe('Products screen', () => {
  it('shows the loading state while products are requested', () => {
    stubFetch(() => new Promise(() => undefined));
    show();
    expect(screen.getByRole('status').textContent).toContain('Loading products');
  });
  it('shows effective prices, available stock and readiness without unsupported counts or edit controls', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show({ limit: 50 }, { edit: false, adjust: product.variants[0]!.id });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('৳2,450')).toBeTruthy();
    expect(within(table).getByText('৳2,950').tagName).toBe('DEL');
    expect(within(table).getByText('Default 3')).toBeTruthy();
    expect(within(table).getByText('Running low')).toBeTruthy();
    expect(within(table).queryByText('Needs a photo')).toBeNull();
    expect(screen.queryByRole('button', { name: /Adjust stock/ })).toBeNull();
    expect(screen.queryByText(/asked|Best seller|Stock value/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Import|AI/ })).toBeNull();
  });
  it('links each product to its full page', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show();
    const links = await screen.findAllByRole('link', { name: product.name });
    expect(links[0]!.getAttribute('href')).toBe(`/products/${product.id}`);
  });
  it('changes the stock of a size from the list row', async () => {
    const bodies: unknown[] = [];
    stubFetch(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        bodies.push([path, JSON.parse(String(init.body))]);
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return response({ items: [product], nextCursor: null });
    });
    show();
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Change stock for Cotton Panjabi' }))[0]!,
    );
    const dialog = await screen.findByRole('dialog', { name: /Adjust stock: Cotton Panjabi/ });
    await userEvent.type(within(dialog).getByLabelText('Change in stock'), '-2');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Damaged');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save stock' }));
    await vi.waitFor(() =>
      expect(bodies).toEqual([
        [
          `/api/variants/${product.variants[0]!.id}/stock-adjustments`,
          { quantity: -2, reason: 'Damaged' },
        ],
      ]),
    );
  });
  it('hides the screen without product access', () => {
    stubFetch(() => {
      throw new Error('No product access');
    });
    show({ limit: 50 }, { edit: false, view: false });
    expect(screen.getByRole('status').textContent).toContain('You do not have access');
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('shows an empty state and retries a failed request', async () => {
    let failed = true;
    stubFetch(async () =>
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
    stubFetch(async (path: string) => {
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
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), 'ab{enter}');
    expect(push).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), 'c{enter}');
    const searchQuery = new URL(push.mock.calls[0]![0], 'http://localhost').searchParams;
    expect(searchQuery.get('search')).toBe('abc');
    expect(searchQuery.get('readiness')).toBe('running_low');
    expect(searchQuery.get('cursor')).toBeNull();
  });
  it('opens a selected variant from the address and clears it on close', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show({ limit: 50 }, { adjust: product.variants[0]!.id });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      new URL(push.mock.calls.at(-1)![0], 'http://localhost').searchParams.get('adjust'),
    ).toBeNull();
  });
  it('refreshes stock counts without replacing an open restock draft', async () => {
    let refreshed = false;
    stubFetch(async (path: string) =>
      path.endsWith('/restock-waiting')
        ? response({ items: [] })
        : response({
            items: [
              {
                ...product,
                variants: [
                  {
                    ...product.variants[0]!,
                    onHand: refreshed ? 8 : 5,
                    available: refreshed ? 6 : 3,
                  },
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
    await userEvent.type(screen.getByLabelText('Default'), '4');
    refreshed = true;
    await client.refetchQueries({ queryKey: productsKeys.all });
    expect(await within(screen.getByRole('dialog')).findByText('6 now')).toBeTruthy();
    expect((screen.getByLabelText('Default') as HTMLInputElement).value).toBe('4');
  });
  it('restocks a size and refreshes the available stock', async () => {
    let changed = false;
    stubFetch(async (path: string, init: RequestInit) => {
      if (path.endsWith('/restock-waiting')) return response({ items: [] });
      if (init.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ quantity: 2, reason: 'Restock' });
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
    const dialog = screen.getByRole('dialog', { name: 'Restock Cotton Panjabi' });
    expect(within(dialog).getByText('3 now')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Default'), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save stock' }));
    expect(await within(screen.getByRole('table')).findByText('Default 5')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps a rejected restock and its error visible', async () => {
    stubFetch(async (path: string, init: RequestInit) => {
      if (path.endsWith('/restock-waiting')) return response({ items: [] });
      if (init.method !== 'POST') return response({ items: [product], nextCursor: null });
      return Response.json(
        { error: { code: 'STOCK_NOT_AVAILABLE', message: 'Not enough available stock' } },
        { status: 409, headers: { 'x-session-context': 'verified' } },
      );
    });
    show();
    await screen.findByRole('table');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Adjust stock for Cotton Panjabi, Default' })[0]!,
    );
    await userEvent.type(screen.getByLabelText('Default'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save stock' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not enough available stock');
    expect((screen.getByLabelText('Default') as HTMLInputElement).value).toBe('10');
  });
});

describe('Product editor navigation', () => {
  it('opens the quick add from Add product and saves a hidden product with stock', async () => {
    const requests: { path: string; body: unknown }[] = [];
    stubFetch(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        requests.push({ path, body: JSON.parse(String(init.body)) });
        return response(path === '/api/products' ? product : {});
      }
      return response({ items: [product], nextCursor: null });
    });
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Cotton Panjabi');
    await userEvent.type(within(dialog).getByLabelText('Selling price ৳'), '1250');
    await userEvent.type(within(dialog).getByLabelText('Stock'), '6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save product' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests[0]).toMatchObject({
      path: '/api/products',
      body: { name: 'Cotton Panjabi', pricePoisha: 125000, status: 'hidden', options: [] },
    });
    expect(requests[1]).toEqual({
      path: `/api/variants/${product.variants[0]!.id}/stock-adjustments`,
      body: { quantity: 6, reason: 'Initial stock' },
    });
  });

  it('carries the typed values to the full page with More details', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Cotton Panjabi');
    await userEvent.type(within(dialog).getByLabelText('Selling price ৳'), '1250');
    await userEvent.type(within(dialog).getByLabelText('Stock'), '6');
    await userEvent.click(within(dialog).getByRole('button', { name: /More details/ }));
    expect(navigate).toHaveBeenCalledWith('/products/new?name=Cotton+Panjabi&price=1250&stock=6');
  });

  it('opens the plain full page with More details when nothing was typed', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await userEvent.click(within(dialog).getByRole('button', { name: /More details/ }));
    expect(navigate).toHaveBeenCalledWith('/products/new');
  });

  it('opens the quick add with the cursor in Name', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByLabelText('Name')),
    );
  });

  it('asks for a name before saving the quick add', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save product' }));
    expect(await within(dialog).findByText('Enter a product name')).toBeTruthy();
  });

  it('shows profit percentage, size chips, and restock button', async () => {
    const itemWithProfit: ProductResponse = {
      ...product,
      variants: [
        {
          ...product.variants[0]!,
          sku: 'UT-PJ-01',
          pricePoisha: 200000,
          costPoisha: 120000,
          reserved: 3,
          available: 2,
        },
      ],
    };
    stubFetch(async () => response({ items: [itemWithProfit], nextCursor: null }));
    show({ limit: 50 });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Men · UT-PJ-01')).toBeTruthy();
    expect(within(table).getByText('40% profit')).toBeTruthy();
    expect(
      within(table).getByRole('button', { name: `Restock ${itemWithProfit.name}` }),
    ).toBeTruthy();
  });

  it('shows Selling status when product is active and not running low, and Needs a price when price is 0', async () => {
    const sellingItem: ProductResponse = {
      ...product,
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae5',
      name: 'Selling Shirt',
      readiness: [],
    };
    const noPriceItem: ProductResponse = {
      ...product,
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae6',
      name: 'No Price Shoes',
      readiness: ['needs_price'],
    };
    stubFetch(async () => response({ items: [sellingItem, noPriceItem], nextCursor: null }));
    show({ limit: 50 });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Selling')).toBeTruthy();
    expect(within(table).getByText('Needs a price')).toBeTruthy();
  });

  it('renders inline toolbar with search input and all readiness chips', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null }));
    show({ limit: 50 });
    await screen.findByRole('table');
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search by name')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Running low' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Needs a price' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Needs a photo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Hidden' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Category' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull();
  });
});
