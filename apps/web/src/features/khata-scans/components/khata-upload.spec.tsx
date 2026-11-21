// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionContext } from '@dakly/contracts/sessions';

import { KhataScanScreen } from './khata-scan-screen';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const pageId = '0193a3c0-7b1e-7c3a-9f00-0000000000a1';
type Sent = { path: string; method: string; body: unknown };
let sent: Sent[] = [];

function respond() {
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    sent.push({
      path,
      method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    if (path.startsWith('https://files.test')) return new Response(null, { status: 200 });
    const headers = { 'x-session-context': 'verified' };
    if (path.endsWith('/khata-scans/imports')) return Response.json([], { headers });
    if (path.endsWith('/khata-scans/pages'))
      return Response.json({ pageId, uploadUrl: 'https://files.test/up' }, { headers });
    return Response.json({ id: pageId, status: 'reading', rows: [] }, { headers });
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
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Khata Scanner upload', () => {
  it('uploads a page, queues the read and puts the page in the address', async () => {
    respond();
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /Add the last 1–3 months/ }));
    await user.upload(
      screen.getByLabelText('Upload photos or PDF'),
      new File(['x'], 'page.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 page' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/customers/khata-scan?pages=${pageId}`));
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

  it('refuses more than 10 pages at once', async () => {
    respond();
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /Add the last 1–3 months/ }));
    const pages = Array.from(
      { length: 11 },
      (_, n) => new File(['x'], `p${n}.jpg`, { type: 'image/jpeg' }),
    );
    await user.upload(screen.getByLabelText('Upload photos or PDF'), pages);

    expect(screen.getByRole('alert').textContent).toContain('up to 10 pages');
    expect(screen.getByRole('button', { name: 'Read 10 pages' })).toBeTruthy();
  });
});
