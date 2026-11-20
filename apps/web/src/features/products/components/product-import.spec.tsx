// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionContext } from '@dakly/contracts/sessions';

import { ImportProductsDialog } from './import-products-dialog';
import { sessionContextKey } from '@/lib/session-context';

const importId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e61';
const file = new File(
  [
    'Product Name,Selling Price,SKU,Stock,Size\r\nCotton kurti,1200,KURTI-M,10,M\r\nCotton kurti,1200,KURTI-L,6,L\r\n',
  ],
  'products.csv',
  { type: 'text/csv' },
);
const finished = {
  id: importId,
  status: 'done',
  undoFinishedAt: null,
  rowsTotal: 2,
  rowsAdded: 2,
  rowsUpdated: 0,
  rowsSkipped: 0,
  rowsFailed: 0,
  reportUrl: null,
};
let sent: { path: string; body: unknown }[] = [];

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    hasMemberships: true,
    contextTag: 'verified',
    currentStore: { storeId: 'shop', name: 'Shop', canEditProducts: true },
  } as SessionContext);
  render(
    <QueryClientProvider client={client}>
      <ImportProductsDialog onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('Import products', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  beforeEach(() => {
    sent = [];
    // jsdom files cannot be read as bytes yet; browsers can.
    File.prototype.arrayBuffer = function (this: File) {
      return new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(this);
      });
    };
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      sent.push({
        path,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      let body: unknown = {};
      if (path === '/api/product-imports')
        body = { importId, uploadUrl: 'https://files.example.test/up' };
      if (path.endsWith('/start')) body = { ...finished, status: 'importing' };
      if (path === `/api/product-imports/${importId}`) body = finished;
      return Response.json(body, {
        status: path.endsWith('/start') ? 202 : 200,
        headers: { 'x-session-context': 'verified' },
      });
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('maps the columns, starts the import and shows the result without an undo', async () => {
    show();
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Product file'), file);
    expect((await screen.findByRole('status')).textContent).toContain('2 rows · 5 columns');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(((await screen.findByLabelText('Product name')) as HTMLSelectElement).value).toBe('0');
    expect((screen.getByLabelText('Price (taka)') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText('Option name') as HTMLInputElement).value).toBe('Size');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('KURTI-L')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('radio', { name: /Leave existing products/ }));
    await user.click(screen.getByRole('button', { name: 'Start import' }));

    expect(await screen.findByText('Import finished.')).toBeTruthy();
    expect(sent.find((request) => request.path.endsWith('/start'))?.body).toEqual({
      mapping: {
        name: 0,
        price: 1,
        sku: 2,
        onHand: 3,
        options: [{ name: 'Size', column: 4 }],
      },
      duplicateMode: 'skip',
    });
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('asks for the price column before going on', async () => {
    show();
    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText('Product file'),
      new File(['Item,Taka\r\nCap,200\r\n'], 'list.csv', { type: 'text/csv' }),
    );
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Choose the column that has product name')).toBeTruthy();
    expect(screen.getByText('Choose the column that has price (taka)')).toBeTruthy();
    expect(screen.queryByText('Step 3 of 5 · Preview')).toBeNull();
  });
});
