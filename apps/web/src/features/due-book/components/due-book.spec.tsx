// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DueCustomerListResponse,
  DueHistoryResponse,
  DueSummaryResponse,
} from '@dakly/contracts/due-book';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { DueBookScreen } from './due-book-screen';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const mituId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e5f';

const summary: DueSummaryResponse = {
  totalOwedPoisha: 793000,
  customersOwing: 5,
  overdueOwedPoisha: 530000,
  overdueCustomers: 3,
  neverRemindedCustomers: 3,
  collectedLast7DaysPoisha: 140000,
};
const customers: DueCustomerListResponse = {
  nextCursor: null,
  items: [
    {
      contactId: '0193a3c0-7b1e-7c3a-9f00-000000000001',
      name: 'Shila Rani',
      phone: '01687334210',
      balancePoisha: 210000,
      oldestDebtAt: ago(72),
      lastRemindedAt: '2026-10-28T05:00:00Z',
    },
    {
      contactId: mituId,
      name: 'Mitu apa',
      phone: '01556781230',
      balancePoisha: 185000,
      oldestDebtAt: ago(6),
      lastRemindedAt: null,
    },
  ],
};
const history: DueHistoryResponse = {
  nextCursor: null,
  items: [
    {
      id: 'entry',
      contactId: mituId,
      kind: 'baki',
      amountPoisha: 185000,
      occurredAt: '2026-11-04T05:00:00Z',
      method: null,
      note: "Women's Kurti",
      source: 'manual',
      recordedByUserId: null,
      createdAt: '2026-11-04T05:00:00Z',
      balanceAfterPoisha: 185000,
    },
  ],
};

type Sent = { path: string; method: string; body: unknown };
let sent: Sent[] = [];

function reply(path: string, method: string, extra: Extra) {
  const custom = extra(path, method);
  if (custom !== undefined) return custom;
  if (path.includes('/due-book/summary')) return summary;
  if (path.includes('/entries')) return history;
  if (path.includes('/due-book/customers?')) return customers;
  return {};
}

type Extra = (path: string, method: string) => unknown;

function respond(extra: Extra = () => undefined) {
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    sent.push({
      path,
      method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return Response.json(reply(path, method, extra), {
      headers: { 'x-session-context': 'verified' },
    });
  });
}

function show(canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context = {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canViewDueBook: true, canEditDueBook: canEdit },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext;
  client.setQueryData(sessionContextKey, context);
  return render(<DueBookScreen filter="all" />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  sent = [];
  // jsdom has no modal dialogs.
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

describe('Due book', () => {
  it('shows the totals, filter counts, when each customer was reminded and how old the debt is', async () => {
    respond();
    show();
    expect(await screen.findByText('৳7,930')).toBeTruthy();
    expect(screen.getByText('3 owe for over 30 days')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Never reminded 3' }).getAttribute('href')).toBe(
      '/due-book?filter=never_reminded',
    );
    expect(await screen.findByText('01687-334210 · Reminded Oct 28')).toBeTruthy();
    expect(screen.getByText('01556-781230 · Never reminded')).toBeTruthy();
    expect(screen.getByText('Oldest 72 days')).toBeTruthy();
  });

  it('opens a customer history inline and closes it again', async () => {
    respond();
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'History for Mitu apa' }));
    expect(await screen.findByText("Women's Kurti")).toBeTruthy();
    expect(screen.getByText('+৳1,850')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hide for Mitu apa' }));
    expect(screen.queryByText("Women's Kurti")).toBeNull();
  });

  it('collects the typed amount in poisha with the chosen method', async () => {
    respond();
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Collect from Mitu apa' }));
    const dialog = screen.getByRole('dialog', { name: 'Collect from Mitu apa' });
    const amount = within(dialog).getByLabelText('Amount received (৳)');
    expect((amount as HTMLInputElement).value).toBe('1850');
    await userEvent.clear(amount);
    await userEvent.type(amount, '850.50');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'bKash' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    await waitFor(() =>
      expect(sent.find((call) => call.method === 'POST')).toEqual({
        path: `/api/due-book/customers/${mituId}/payments`,
        method: 'POST',
        body: { amountPoisha: 85050, method: 'bkash' },
      }),
    );
  });

  it('adds baki to the customer who already has that phone, without making another one', async () => {
    respond((path) =>
      path.startsWith('/api/contacts?') ? { items: [{ id: mituId }], nextCursor: null } : undefined,
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add baki' }));
    const dialog = screen.getByRole('dialog', { name: 'Add baki' });
    await userEvent.type(within(dialog).getByLabelText('Phone'), '01556-781230');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Mitu apa');
    await userEvent.type(within(dialog).getByLabelText('Amount they owe (৳)'), '500');
    await userEvent.type(within(dialog).getByLabelText('Note'), '2 shirts');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add baki' }));
    await waitFor(() =>
      expect(sent.find((call) => call.path.endsWith('/baki'))).toEqual({
        path: `/api/due-book/customers/${mituId}/baki`,
        method: 'POST',
        body: { amountPoisha: 50000, note: '2 shirts' },
      }),
    );
    expect(sent.some((call) => call.path === '/api/contacts')).toBe(false);
  });

  it('makes the customer first when no one has the phone', async () => {
    respond((path, method) => {
      if (path.startsWith('/api/contacts?')) return { items: [], nextCursor: null };
      if (path === '/api/contacts' && method === 'POST') return { id: mituId };
      return undefined;
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add baki' }));
    const dialog = screen.getByRole('dialog', { name: 'Add baki' });
    await userEvent.type(within(dialog).getByLabelText('Phone'), '01712345678');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nusrat Jahan');
    await userEvent.type(within(dialog).getByLabelText('Amount they owe (৳)'), '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add baki' }));
    await waitFor(() =>
      expect(
        sent.find((call) => call.path === '/api/contacts' && call.method === 'POST')?.body,
      ).toEqual({ name: 'Nusrat Jahan', phone: '01712345678' }),
    );
    await waitFor(() =>
      expect(sent.find((call) => call.path.endsWith('/baki'))?.body).toEqual({
        amountPoisha: 12000,
      }),
    );
  });

  it('hides the write buttons from a member who can only view', async () => {
    respond();
    show(false);
    await screen.findByText('৳7,930');
    expect(screen.getByRole('button', { name: 'History for Mitu apa' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add baki' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collect from Mitu apa' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remind all/ })).toBeNull();
  });
});
