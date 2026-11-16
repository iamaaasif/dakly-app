// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { SegmentResponse } from '@dakly/contracts/segments';
import type { SessionContext } from '@dakly/contracts/sessions';

import { SegmentsScreen } from './segments-screen';
import { sessionContextKey } from '@/lib/session-context';

// jsdom has no modal dialogs.
beforeAll(() => {
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

const vip: SegmentResponse = {
  id: '7d0f8a52-4c7e-4b8e-9a51-0e6f3f0b2c11',
  name: 'VIP in Dhaka',
  rules: {
    match: 'all',
    conditions: [
      { field: 'tag', operator: 'is_any_of', values: ['vip'] },
      {
        match: 'any',
        conditions: [
          { field: 'district', operator: 'is_none_of', values: ['Dhaka'] },
          { field: 'consent', channel: 'sms', granted: true },
        ],
      },
    ],
  },
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

type Request = { method: string; path: string; body: unknown };

function serve(reply: (request: Request) => Response) {
  const requests: Request[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const request = {
      method: init.method ?? 'GET',
      path: new URL(url, 'http://web.test').pathname.replace(/^\/api/, ''),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(request);
    return reply(request);
  });
  return requests;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'x-session-context': 'verified' } });

function show(child: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: SessionContext = {
    user: { id: 'actor', name: 'Actor' },
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewTeam: false,
      canEditTeam: false,
      canViewCustomers: true,
      canCreateCustomer: true,
      canViewSegments: true,
      canApproveSupport: false,
      canTransferOwnership: false,
      canViewStoreSettings: false,
      canEditStoreSettings: false,
      canChangeExtensions: false,
    },
    contextTag: 'verified',
    hasMemberships: true,
  };
  client.setQueryData(sessionContextKey, context);
  return render(child, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('Segments screen', () => {
  it('lists a segment with its rule in words and its live count', async () => {
    const requests = serve(({ path }) =>
      path === '/segments/preview' ? json({ count: 42 }) : json({ items: [vip], nextCursor: null }),
    );
    show(<SegmentsScreen />);
    expect(screen.getByRole('status', { name: 'Loading segments' })).toBeTruthy();
    await screen.findByRole('heading', { name: 'VIP in Dhaka' });
    expect(
      screen.getByText('Tag is vip and (District is not Dhaka or agreed to SMS messages)'),
    ).toBeTruthy();
    expect(await screen.findByText('42 customers match')).toBeTruthy();
    expect(requests.find(({ path }) => path === '/segments/preview')?.body).toEqual({
      rules: vip.rules,
    });
  });

  it('shows the empty list and a failed list with a retry', async () => {
    let fail = true;
    serve(() =>
      fail
        ? json({ error: { code: 'FORBIDDEN', message: 'You cannot view segments.' } }, 403)
        : json({ items: [], nextCursor: null }),
    );
    show(<SegmentsScreen />);
    expect(await screen.findByText('You cannot view segments.')).toBeTruthy();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry segments' }));
    expect(
      await screen.findByText('No segments yet. Create one to group customers for a campaign.'),
    ).toBeTruthy();
  });

  it('deletes a segment after naming it in the confirmation', async () => {
    const user = userEvent.setup();
    let items = [vip];
    serve(({ path, method }) => {
      if (path === '/segments/preview') return json({ count: 3 });
      if (method === 'DELETE') {
        items = [];
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return json({ items, nextCursor: null });
    });
    show(<SegmentsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Delete VIP in Dhaka' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete VIP in Dhaka?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete segment' }));
    expect(
      await screen.findByText('No segments yet. Create one to group customers for a campaign.'),
    ).toBeTruthy();
  });
});
