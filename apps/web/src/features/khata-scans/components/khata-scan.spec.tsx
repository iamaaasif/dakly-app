// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  KhataImportResponse,
  KhataPageResponse,
  KhataRowResponse,
} from '@dakly/contracts/khata-scans';
import type { SessionContext } from '@dakly/contracts/sessions';

import { KhataScanScreen } from './khata-scan-screen';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const pageId = '0193a3c0-7b1e-7c3a-9f00-0000000000a1';
const mituId = '0193a3c0-7b1e-7c3a-9f00-0000000000b1';
const rowIds = [1, 2, 3].map((n) => `0193a3c0-7b1e-7c3a-9f00-00000000010${n}`);

const row = (n: number, overrides: Partial<KhataRowResponse>): KhataRowResponse => ({
  id: rowIds[n - 1]!,
  rowNumber: n,
  entryDate: '2026-11-02',
  name: 'Kamal bhai',
  phone: '01819776120',
  item: 'Panjabi',
  amountPoisha: 245000,
  kind: 'sale',
  confidence: 90,
  needsCheck: false,
  match: null,
  ...overrides,
});
const readPage: KhataPageResponse = {
  id: pageId,
  status: 'read',
  failureCode: null,
  photoUrl: null,
  createdAt: '2026-11-21T10:00:00Z',
  rows: [
    row(1, {}),
    row(2, { name: 'Hasan', phone: null, confidence: 48, needsCheck: true }),
    row(3, {
      name: 'Mitu apa',
      phone: '01556781231',
      kind: 'baki',
      amountPoisha: 185000,
      match: { contactId: mituId, kind: 'similar_phone' },
    }),
  ],
};
const done: KhataImportResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-0000000000c1',
  pageId,
  status: 'done',
  rowsRead: 3,
  rowsImported: 2,
  rowsSkipped: 1,
  customersCreated: 1,
  createdAt: '2026-11-21T10:05:00Z',
  undoUntil: '2999-01-01T00:00:00Z',
};

type Sent = { path: string; method: string; body: unknown };
let sent: Sent[] = [];

function respond(imports: KhataImportResponse[] = []) {
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    sent.push({
      path,
      method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const headers = { 'x-session-context': 'verified' };
    if (path.startsWith('https://files.test')) return new Response(null, { status: 200 });
    if (path.endsWith('/khata-scans/imports')) return Response.json(imports, { headers });
    if (path.endsWith('/khata-scans/pages'))
      return Response.json({ pageId, uploadUrl: 'https://files.test/up' }, { headers });
    if (path.includes('/import')) return Response.json(done, { headers });
    if (path.includes(`/contacts/${mituId}`))
      return Response.json({ id: mituId, name: 'Mitu Akter', phone: '01556781230' }, { headers });
    return Response.json(readPage, { headers });
  });
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canCreateCustomer: true },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext);
  return render(<KhataScanScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  sent = [];
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

// Reads one page and returns the row of the unsure line, "Hasan".
async function reviewHasan(user: User) {
  await readOnePage(user);
  return (await screen.findByText('Hasan')).closest('li')!;
}

async function readOnePage(user: User) {
  await user.click(screen.getByRole('button', { name: /Add the last 1–3 months/ }));
  const photo = new File(['x'], 'page.jpg', { type: 'image/jpeg' });
  await user.upload(screen.getByLabelText('Upload photos or PDF'), photo);
  await user.click(screen.getByRole('button', { name: 'Read 1 page' }));
}

describe('Khata Scanner', () => {
  it('uploads a page, queues the read and shows the rows to review', async () => {
    respond();
    const user = userEvent.setup();
    show();
    await readOnePage(user);

    expect(await screen.findByText('Hasan')).toBeTruthy();
    expect(sent.map((call) => `${call.method} ${call.path.replace('/api', '')}`)).toEqual(
      expect.arrayContaining([
        'POST /khata-scans/pages',
        'PUT https://files.test/up',
        `POST /khata-scans/pages/${pageId}/read`,
      ]),
    );
    expect(sent.find((call) => call.path.endsWith('/khata-scans/pages'))?.body).toEqual({
      contentType: 'image/jpeg',
      sizeBytes: 1,
    });
  });

  it('keeps Import off until the yellow row is checked or skipped, then sends one decision per row', async () => {
    respond();
    const user = userEvent.setup();
    show();
    const hasan = await reviewHasan(user);

    expect(
      (screen.getByRole('button', { name: 'Import 3 rows' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/1 row needs checking/)).toBeTruthy();

    await user.click(within(hasan).getByRole('button', { name: 'Looks right' }));
    await user.click(screen.getByRole('button', { name: 'Yes, link' }));
    await user.click(screen.getByRole('button', { name: 'Import 3 rows' }));

    expect(await screen.findByText('Your khata is now in Dakly')).toBeTruthy();
    const imported = sent.find((call) => call.path.endsWith(`/pages/${pageId}/import`));
    expect(imported?.body).toEqual({
      rows: [
        { rowId: rowIds[0], action: 'import', isChecked: false },
        { rowId: rowIds[1], action: 'import', isChecked: true },
        { rowId: rowIds[2], action: 'import', isChecked: false, mergeContactId: mituId },
      ],
    });
  });

  it('leaves a skipped row out of the import and the count on the button', async () => {
    respond();
    const user = userEvent.setup();
    show();
    const hasan = await reviewHasan(user);

    await user.click(within(hasan).getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('Everything is checked. Ready to import.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Import 2 rows' }));
    await waitFor(() =>
      expect(sent.find((call) => call.path.endsWith('/import'))?.body).toMatchObject({
        rows: [{ action: 'import' }, { rowId: rowIds[1], action: 'skip' }, { action: 'import' }],
      }),
    );
  });

  it('offers a similar-phone customer and merges only when the owner says yes', async () => {
    respond();
    const user = userEvent.setup();
    show();
    await readOnePage(user);

    expect(await screen.findByText(/Same person as Mitu Akter\?/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Yes, link' }));
    expect(screen.getByText(/Linked to Mitu Akter/)).toBeTruthy();
  });
});
