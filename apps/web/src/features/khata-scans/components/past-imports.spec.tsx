// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { KhataImportResponse } from '@dakly/contracts/khata-scans';
import type { SessionContext } from '@dakly/contracts/sessions';

import { KhataScanScreen } from './khata-scan-screen';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const done: KhataImportResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-0000000000c1',
  pageId: '0193a3c0-7b1e-7c3a-9f00-0000000000a1',
  status: 'done',
  rowsRead: 3,
  rowsImported: 2,
  rowsSkipped: 1,
  customersCreated: 1,
  createdAt: '2026-11-21T10:05:00Z',
  undoUntil: '2999-01-01T00:00:00Z',
};

let paths: string[] = [];

function respond(imports: KhataImportResponse[]) {
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
    return Response.json(path.endsWith('/khata-scans/imports') ? imports : done, {
      headers: { 'x-session-context': 'verified' },
    });
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
  paths = [];
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

describe('Past imports', () => {
  it('lists imports and undoes one that is still inside the 7 days', async () => {
    respond([done]);
    const user = userEvent.setup();
    show();

    expect(await screen.findByText('2 of 3 rows imported · 1 new customers')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Undo import' }));

    await waitFor(() =>
      expect(paths.some((path) => path.endsWith(`/imports/${done.id}/undo`))).toBe(true),
    );
  });

  it('shows no Undo for an import that was undone or is past its deadline', async () => {
    respond([
      { ...done, status: 'undone' },
      { ...done, id: 'old', undoUntil: '2020-01-01T00:00:00Z' },
    ]);
    show();

    expect(await screen.findByText('Undone')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
