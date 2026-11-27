// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProductListItem, ProductListQuery } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

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
const product: ProductListItem = {
  waitingToConfirmCount: 0,
  source: 'manual',
  code: null,
  version: 1,
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  name: 'Cotton Panjabi',
  description: null,
  categoryId: '019c01ea-cf15-7d31-a7f5-d73d66007ae9',
  category: 'Men',
  brandId: null,
  brand: null,
  weightGrams: null,
  aliases: [],
  pricePoisha: 245000,
  compareAtPricePoisha: 295000,
  negotiationEnabled: false,
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
  client.setQueryData(sessionContextKey, context);
  client.setQueryData(productsKeys.categories(context.contextTag), { items: ['Cotton'] });
  const content = () => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProductsScreen query={query} adjust={adjust} />
      </ToastProvider>
    </QueryClientProvider>
  );
  const rendered = render(content());
  push.mockImplementation((href: string) => {
    const parameters = new URL(href, 'http://localhost').searchParams;
    adjust = parameters.get('adjust') ?? undefined;
    rendered.rerender(content());
  });
  return {
    client,
    ...rendered,
    setQuery(next: ProductListQuery) {
      query = next;
      rendered.rerender(content());
    },
  };
}
async function openArchiveDialog(table: HTMLElement) {
  await userEvent.click(
    within(table).getByRole('button', { name: 'More actions for Cotton Panjabi' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
  return screen.findByRole('dialog', { name: 'Archive Cotton Panjabi?' });
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
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
    show({ limit: 50 }, { edit: false, adjust: product.variants[0]!.id });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('৳2,450')).toBeTruthy();
    expect(within(table).getByText('৳2,950').tagName).toBe('DEL');
    expect(within(table).getByText('Default 3')).toBeTruthy();
    expect(within(table).getByText('Active')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More actions for Cotton Panjabi' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Adjust stock/ })).toBeNull();
    expect(screen.queryByText(/asked|Best seller|Stock value/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Import|AI/ })).toBeNull();
  });
  it('copies a product as a draft from the desktop row and phone card', async () => {
    const copy = { ...product, id: '019c01ea-cf15-7d31-a7f5-d73d66007af0', status: 'hidden' };
    const posted: string[] = [];
    stubFetch(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(path);
        return response(copy);
      }
      return response({ items: [product], nextCursor: null, totalCount: 1 });
    });
    show();
    await screen.findByRole('table');
    for (const container of [
      screen.getByRole('table'),
      screen.getByRole('list', { name: 'Products' }),
    ]) {
      await userEvent.click(
        within(container).getByRole('button', { name: 'More actions for Cotton Panjabi' }),
      );
      await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
      await vi.waitFor(() => expect(push).toHaveBeenLastCalledWith(`/products/${copy.id}`));
    }
    expect(posted).toEqual([
      `/api/products/${product.id}/duplicate`,
      `/api/products/${product.id}/duplicate`,
    ]);
  });
  it('returns focus to the row menu after cancelling archive', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
    show();
    const table = await screen.findByRole('table', { name: 'Products' });
    const trigger = within(table).getByRole('button', { name: 'More actions for Cotton Panjabi' });
    const dialog = await openArchiveDialog(table);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('removes an archived product from the catalogue and bulk selection', async () => {
    let archived = false;
    stubFetch(async (path, init) => {
      if (path === `/api/products/${product.id}` && init.method === 'DELETE') {
        archived = true;
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return response({ items: archived ? [] : [product], nextCursor: null, totalCount: 1 });
    });
    show();
    const table = await screen.findByRole('table');
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Cotton Panjabi' }));
    const dialog = await openArchiveDialog(table);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive product' }));
    expect(await screen.findByRole('heading', { name: 'No product created yet' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('1 selected')).toBeNull();
  });
  it('closes the bulk review when an archived product was selected', async () => {
    const scarf = {
      ...product,
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae4',
      name: 'Silk scarf',
    };
    let archived = false;
    stubFetch(async (path, init) => {
      if (path === `/api/products/${product.id}` && init.method === 'DELETE') {
        archived = true;
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return response({
        items: archived ? [scarf] : [product, scarf],
        nextCursor: null,
        totalCount: 1,
      });
    });
    show();
    const table = await screen.findByRole('table', { name: 'Products' });
    await userEvent.click(
      within(table).getByRole('checkbox', { name: 'Select all products on this page' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^Hide$/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Review 2 changes' }));
    expect(screen.getByRole('region', { name: 'Review changes' })).toBeTruthy();

    const dialog = await openArchiveDialog(table);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive product' }));

    expect(await screen.findByText('1 selected')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Review changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Hide$/ }));
    expect(screen.getByRole('button', { name: 'Review 1 change' })).toBeTruthy();
    expect(screen.queryByLabelText('Status for Cotton Panjabi')).toBeNull();
    expect(screen.getByLabelText('Status for Silk scarf')).toBeTruthy();
  });
  it('offers Hide when open orders prevent archiving and refreshes the selected product', async () => {
    let status = 'active';
    stubFetch(async (path, init) => {
      if (path === `/api/products/${product.id}` && init.method === 'DELETE')
        return Response.json(
          {
            error: {
              code: 'PRODUCT_HAS_OPEN_ORDERS',
              message: 'Finish or cancel open orders before archiving this product',
            },
          },
          { status: 409, headers: { 'x-session-context': 'verified' } },
        );
      if (path === `/api/products/${product.id}` && init.method === 'PATCH') {
        status = JSON.parse(String(init.body)).status;
        return response({ ...product, status });
      }
      return response({ items: [{ ...product, status }], nextCursor: null, totalCount: 1 });
    });
    show();
    const table = await screen.findByRole('table');
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Cotton Panjabi' }));
    const dialog = await openArchiveDialog(table);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive product' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hide product' }));
    expect(await within(table).findByText('Draft')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('1 selected')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Edit in grid' }));
    expect(screen.getByLabelText('Status for Cotton Panjabi')).toHaveProperty('value', 'hidden');
  });
  it('links each product to its full page', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
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
      return response({ items: [product], nextCursor: null, totalCount: 1 });
    });
    show();
    const table = await screen.findByRole('table');
    await userEvent.click(
      within(table).getByRole('button', { name: 'More actions for Cotton Panjabi' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Change stock' }));
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
        : response({ items: [], nextCursor: null, totalCount: 1 }),
    );
    show();
    expect((await screen.findByRole('alert')).textContent).toContain('Products could not load');
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry products' }));
    expect(await screen.findByRole('heading', { name: 'No product created yet' })).toBeTruthy();
    const catalogue = screen.getByRole('region', { name: 'Product catalogue' });
    expect(
      within(catalogue).getByText('Once you create a product, it will show here.'),
    ).toBeTruthy();
    await userEvent.click(within(catalogue).getByRole('button', { name: 'Add product' }));
    expect(await screen.findByRole('dialog', { name: 'Add product' })).toBeTruthy();
  });
  it('offers to clear filters when a search has no products', async () => {
    stubFetch(async () => response({ items: [], nextCursor: null, totalCount: 1 }));
    show({ limit: 50, search: 'Cotton' });
    expect(await screen.findByText('No products on this page')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(
      '/products',
    );
  });
  it('keeps search and status when paging and clears the cursor when filters change', async () => {
    const cursor = '019c01ea-cf15-7d31-a7f5-d73d66007ae4';
    let requested = '';
    stubFetch(async (path: string) => {
      requested = path;
      return response({ items: [product], nextCursor: cursor, totalCount: 120 });
    });
    show({ limit: 50, search: 'Cotton', readiness: 'running_low', cursor: product.id });
    await screen.findByText('Showing 1 of 120');
    expect(new URL(requested, 'http://localhost').searchParams.get('cursor')).toBe(product.id);
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const nextQuery = new URL(push.mock.calls[0]![0], 'http://localhost').searchParams;
    expect(nextQuery.get('cursor')).toBe(cursor);
    expect(nextQuery.get('search')).toBe('Cotton');
    expect(nextQuery.get('readiness')).toBe('running_low');
    const search = screen.getByRole('searchbox', { name: 'Search products' });
    await userEvent.clear(search);
    await userEvent.type(search, 'ab{enter}');
    expect(push).toHaveBeenCalledTimes(1);
    await userEvent.type(search, 'c{enter}');
    const searchQuery = new URL(push.mock.calls[1]![0], 'http://localhost').searchParams;
    expect(searchQuery.get('search')).toBe('abc');
    expect(searchQuery.get('readiness')).toBe('running_low');
    expect(searchQuery.get('cursor')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filter products by status' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'All products' }));
    const allQuery = new URL(push.mock.calls[2]![0], 'http://localhost').searchParams;
    expect(allQuery.get('cursor')).toBeNull();
    expect(allQuery.get('search')).toBe('Cotton');
    expect(allQuery.has('readiness')).toBe(false);
  });
  it('starts on page 1 with Previous off and Next set to the server cursor', async () => {
    const cursor = '019c01ea-cf15-7d31-a7f5-d73d66007ae4';
    stubFetch(async () => response({ items: [product], nextCursor: cursor, totalCount: 120 }));
    show({ limit: 50 });
    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const nextQuery = new URL(push.mock.calls[0]![0], 'http://localhost').searchParams;
    expect(nextQuery.get('cursor')).toBe(cursor);
  });
  it('keeps Best selling selected in paging and filter changes', async () => {
    const nextCursor = `3_2026-11-17T08:00:00Z_${product.id}`;
    let requested = '';
    let finishSort!: (value: Response) => void;
    const sorting = new Promise<Response>((resolve) => {
      finishSort = resolve;
    });
    stubFetch(async (path: string) => {
      requested = path;
      return path.includes('sort=best_selling')
        ? sorting
        : response({ items: [product], nextCursor: product.id, totalCount: 120 });
    });
    const query = { limit: 50, search: 'Cotton', readiness: 'running_low' } as const;
    const { setQuery } = show(query);
    await screen.findByText('Showing 1 of 120');
    setQuery({ ...query, sort: 'best_selling' });
    finishSort(response({ items: [product], nextCursor, totalCount: 120 }));
    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Sort products' }).textContent).toBe(
        'Best selling',
      ),
    );
    expect(new URL(requested, 'http://localhost').searchParams.get('sort')).toBe('best_selling');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const nextQuery = new URL(push.mock.calls[0]![0], 'http://localhost').searchParams;
    expect(nextQuery.get('sort')).toBe('best_selling');
    expect(nextQuery.get('cursor')).toBe(nextCursor);
    await userEvent.click(screen.getByRole('button', { name: 'Filter products by status' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'All products' }));
    const allQuery = new URL(push.mock.calls[1]![0], 'http://localhost').searchParams;
    expect(allQuery.get('sort')).toBe('best_selling');
    expect(allQuery.get('search')).toBe('Cotton');
    expect(allQuery.has('readiness')).toBe(false);
  });

  it('opens a selected variant from the address and clears it on close', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
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
      if (init.method !== 'POST')
        return response({ items: [product], nextCursor: null, totalCount: 1 });
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
      return response({ items: [product], nextCursor: null, totalCount: 1 });
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
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
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
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await userEvent.click(within(dialog).getByRole('button', { name: /More details/ }));
    expect(navigate).toHaveBeenCalledWith('/products/new');
  });

  it('opens the quick add with the cursor in Name', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByLabelText('Name')),
    );
  });

  it('asks for a name before saving the quick add', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
    show();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add product' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save product' }));
    expect(await within(dialog).findByText('Enter a product name')).toBeTruthy();
  });

  it('shows profit percentage, size chips, and restock button', async () => {
    const itemWithProfit: ProductListItem = {
      ...product,
      code: 'UT-PJ-01',
      variants: [
        {
          ...product.variants[0]!,
          pricePoisha: 200000,
          costPoisha: 120000,
          reserved: 3,
          available: 2,
        },
      ],
    };
    stubFetch(async () => response({ items: [itemWithProfit], nextCursor: null, totalCount: 1 }));
    show({ limit: 50 });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Men · UT-PJ-01')).toBeTruthy();
    expect(within(table).getByText('40% profit')).toBeTruthy();
    expect(
      within(table).getByRole('button', { name: `Restock ${itemWithProfit.name}` }),
    ).toBeTruthy();
  });

  it('shows Active status and labels a product that needs a price', async () => {
    const sellingItem: ProductListItem = {
      ...product,
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae5',
      name: 'Selling Shirt',
      readiness: [],
    };
    const noPriceItem: ProductListItem = {
      ...product,
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ae6',
      name: 'No Price Shoes',
      readiness: ['needs_price'],
    };
    stubFetch(async () =>
      response({ items: [sellingItem, noPriceItem], nextCursor: null, totalCount: 1 }),
    );
    show({ limit: 50 });
    const table = await screen.findByRole('table');
    const row = within(table).getByRole('row', { name: /Selling Shirt/ });
    expect(within(row).getByText('Active')).toBeTruthy();
  });

  it('renders the toolbar, status filter and table settings from the design', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
    show({ limit: 50 });
    await screen.findByRole('table');
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search name or code')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Sort products' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Filter products by status' }));
    for (const name of ['Running low', 'Out of stock', 'Needs a price', 'Needs a photo', 'Draft'])
      expect(screen.getByRole('menuitemcheckbox', { name })).toBeTruthy();
  });

  it('shows the waiting count, the found in chats badge and the footer total', async () => {
    const found: ProductListItem = {
      ...product,
      name: 'Leather sandal',
      source: 'chat',
      isStockTracked: false,
      waitingToConfirmCount: 2,
    };
    stubFetch(async () => response({ items: [found], nextCursor: product.id, totalCount: 2486 }));
    show({ limit: 50 });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Found in chats')).toBeTruthy();
    expect(within(table).getByText('2 waiting to confirm')).toBeTruthy();
    expect(within(table).getByText('Not tracked')).toBeTruthy();
    expect(screen.getByText('Showing 1 of 2,486')).toBeTruthy();
    expect(screen.getByText('Page 1 of 50')).toBeTruthy();
  });

  it('hides a column chosen in table settings', async () => {
    stubFetch(async () => response({ items: [product], nextCursor: null, totalCount: 1 }));
    show({ limit: 50 });
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Price' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Table settings' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Price' }));
    expect(within(table).queryByRole('columnheader', { name: 'Price' })).toBeNull();
  });
});
