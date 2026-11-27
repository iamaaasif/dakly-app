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

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const page = {
  title: 'Cotton T-shirt',
  backHref: '/products',
  photos: <p>Photos</p>,
  status: <p>Status</p>,
};

const saved: ProductResponse = {
  ...createProductSchema.parse({ name: 'Cotton T-shirt', pricePoisha: 120000 }),
  version: 1,
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  category: null,
  brand: null,
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

function show(product?: ProductResponse, readOnly = false) {
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
      <ProductForm product={product} onSaved={vi.fn()} page={{ ...page, readOnly }} />
    </QueryClientProvider>,
  );
}

async function addValues(optionLabel: string, ...values: string[]) {
  await userEvent.click(screen.getByRole('button', { name: `Add values to ${optionLabel}` }));
  for (const value of values)
    await userEvent.type(screen.getByLabelText('Add new value'), `${value}{Enter}`);
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
}

async function choosePresets(optionLabel: string, ...values: string[]) {
  await userEvent.click(screen.getByRole('button', { name: `+ ${optionLabel}` }));
  await userEvent.click(screen.getByRole('button', { name: `Add values to ${optionLabel}` }));
  for (const value of values) await userEvent.click(screen.getByRole('checkbox', { name: value }));
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
}

async function editVariant(label: string) {
  await userEvent.click(screen.getByRole('button', { name: `Edit variant ${label}` }));
  return within(screen.getByRole('dialog', { name: label }));
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('Variants card', () => {
  it('shows plain stock, code and warn-at fields while a product has no options', () => {
    show(saved);
    const card = screen.getByRole('heading', { name: 'Variations' }).parentElement!;
    const inventory = screen.getByRole('heading', { name: 'Inventory' }).parentElement!;
    expect(within(inventory).getByLabelText<HTMLInputElement>('Available stock').value).toBe('12');
    expect(within(inventory).getByLabelText<HTMLInputElement>('Product code').value).toBe('TS-1');
    expect(within(inventory).getByLabelText('Low stock warning')).toBeTruthy();
    expect(within(card).getByRole('button', { name: '+ Other option' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: /Suggest options/ })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('applies selected presets together and keeps a cancelled edit out of the grid', async () => {
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: '+ Color' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add values to Color' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Black' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'White' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Price for Black')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByLabelText('Price for Black')).toBeTruthy();
    expect(screen.getByLabelText('Price for White')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Color' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Black from Color' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel option changes' }));
    expect(screen.getByLabelText('Price for Black')).toBeTruthy();
  });

  it('builds the grid as values are typed and moves the stock to the first value', async () => {
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: '+ Other option' }));
    await userEvent.type(screen.getByLabelText('Option name'), 'Size');
    await addValues('Size', 'S', 'M', 'L');
    const first = await editVariant('S');
    expect(first.getByLabelText<HTMLInputElement>('Stock for S').value).toBe('12');
    expect(first.getByLabelText<HTMLInputElement>('Code for S').value).toBe('TS-1');
    await userEvent.click(first.getByRole('button', { name: 'Close' }));
    const second = await editVariant('M');
    expect(second.getByLabelText<HTMLInputElement>('Stock for M').value).toBe('0');
    await userEvent.click(second.getByRole('button', { name: 'Close' }));
    expect((screen.getByLabelText('Cost for L') as HTMLInputElement).value).toBe('650.00');
  });

  it('suggests common sizes and groups rows by the first option', async () => {
    show(saved);
    await choosePresets('Color', 'Black', 'White');
    await choosePresets('Size', 'S', 'M');
    const black = screen.getByRole('region', { name: 'Black variants' });
    expect(within(black).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(within(black).getByRole('button', { name: /^Black2 variants/ }));
    expect(within(black).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'White variants' })).toBeTruthy();
  });

  it('uses the selected option in the URL to group rows and apply a group price', async () => {
    const colors = ['Black', 'White'];
    const sizes = ['S', 'M'];
    show({
      ...saved,
      options: [
        { name: 'Color', values: colors },
        { name: 'Size', values: sizes },
      ],
      variants: colors.flatMap((color, colorIndex) =>
        sizes.map((size, sizeIndex) => ({
          ...saved.variants[0]!,
          id: `019c01ea-cf15-7d31-a7f5-d73d66007af${colorIndex * sizes.length + sizeIndex}`,
          optionValues: { Color: color, Size: size },
          title: `${color} / ${size}`,
        })),
      ),
    });
    await userEvent.selectOptions(screen.getByLabelText('Show by'), 'Size');
    expect(new URLSearchParams(window.location.search).get('groupBy')).toBe('Size');

    const small = screen.getByRole('region', { name: 'S variants' });
    await userEvent.type(within(small).getByLabelText('Price for all S variants'), '1300');
    expect((screen.getByLabelText('Price for Black / S') as HTMLInputElement).value).toBe('1300');
    expect((screen.getByLabelText('Price for White / S') as HTMLInputElement).value).toBe('1300');
    expect((screen.getByLabelText('Price for Black / M') as HTMLInputElement).value).toBe('');

    await userEvent.click(screen.getByLabelText('Price for Black / S'));
    await userEvent.paste('1100\t500\n1150\t600');
    expect((screen.getByLabelText('Price for White / S') as HTMLInputElement).value).toBe('1150');
    expect((screen.getByLabelText('Cost for White / S') as HTMLInputElement).value).toBe('600');
    expect((screen.getByLabelText('Price for Black / M') as HTMLInputElement).value).toBe('');
  });

  it('lets members view variant details without exposing editing or upload controls', async () => {
    show(
      {
        ...saved,
        options: [{ name: 'Size', values: ['M'] }],
        variants: [{ ...saved.variants[0]!, title: 'M', optionValues: { Size: 'M' } }],
      },
      true,
    );

    await userEvent.click(screen.getByRole('button', { name: 'View variant M' }));
    const details = within(screen.getByRole('dialog', { name: 'M' }));
    expect(details.getByLabelText<HTMLInputElement>('Stock for M').value).toBe('12');
    expect(details.getByLabelText<HTMLInputElement>('Code for M').readOnly).toBe(true);
    expect(details.queryByLabelText('Add photo')).toBeNull();
    await userEvent.click(details.getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('Show by').hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('Escape closes the photo confirmation before the variant sheet', async () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    show({
      ...saved,
      options: [{ name: 'Size', values: ['M'] }],
      variants: [
        {
          ...saved.variants[0]!,
          title: 'M',
          optionValues: { Size: 'M' },
          photos: [{ id: saved.id, url: 'https://images.example.test/variant' }],
          reserved: 2,
          available: 10,
        },
      ],
    });

    const sheet = await editVariant('M');
    const stock = sheet.getByLabelText<HTMLInputElement>('Stock for M');
    expect(stock.value).toBe('12');
    expect(document.getElementById(stock.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Includes reserved stock (2).',
    );
    const remove = sheet.getByRole('button', { name: 'Remove photo 1' });
    await userEvent.click(remove);
    expect(
      screen.getByRole('dialog', { name: 'Remove photo from Cotton T-shirt M?' }),
    ).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Remove photo/ })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'M' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(remove));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'M' })).toBeNull());
  });

  it('sets a price on the chosen rows and keeps removed rows out until asked', async () => {
    show(saved);
    await userEvent.click(screen.getByRole('button', { name: '+ Other option' }));
    await userEvent.type(screen.getByLabelText('Option name'), 'Size');
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
    await userEvent.click(screen.getByRole('button', { name: '+ Other option' }));
    await userEvent.type(screen.getByLabelText('Option name'), 'Size');
    await addValues('Size', 'S', 'M');
    await userEvent.click(screen.getByLabelText('Price for S'));
    await userEvent.paste('1,200\t650\n1,300\t700');
    expect((screen.getByLabelText('Price for M') as HTMLInputElement).value).toBe('1300');
    expect((screen.getByLabelText('Cost for M') as HTMLInputElement).value).toBe('700');
    const variant = await editVariant('S');
    expect(variant.getByLabelText('Profit for S').textContent).toContain('46%');
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
    const small = await editVariant('S');
    expect(small.getByLabelText('Stock for S')).toBeTruthy();
    await userEvent.click(small.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Edit variant L' })).toBeNull();
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
    const stock = screen.getByLabelText('Available stock');
    await userEvent.clear(stock);
    await userEvent.type(stock, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
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
