// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SmsSettings } from './sms-settings';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const sender = (overrides: object) => ({
  id: '11111111-1111-4111-8111-111111111111',
  senderName: 'Urban Trend',
  status: 'requested',
  rejectionReason: null,
  createdAt: '2026-11-20T06:00:00.000Z',
  decidedAt: null,
  ...overrides,
});
const requests: { method: string; url: string; body?: unknown }[] = [];

function show(items: object[], canEdit = true) {
  let documents = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method: init.method ?? 'GET', url, body });
    if (url.startsWith('https://storage.test')) return new Response(null, { status: 200 });
    if (url.endsWith('/documents/upload-url'))
      return Response.json(
        {
          fileId: `0000000${(documents += 1)}-0000-4000-8000-000000000000`,
          uploadUrl: 'https://storage.test/file',
        },
        { headers },
      );
    if (
      url.endsWith('/documents/confirm') ||
      (init.method === 'POST' && url.endsWith('/sms-sender-ids'))
    )
      return Response.json({ id: 'ok' }, { status: 201, headers });
    return Response.json({ items, nextCursor: null }, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewStoreSettings: true, canEditStoreSettings: canEdit },
  });
  render(
    <QueryClientProvider client={client}>
      <SmsSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requests.length = 0;
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
});

it('shows each request with its status and the rejection reason', async () => {
  show([
    sender({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'rejected',
      rejectionReason: 'Name differs from the licence',
    }),
  ]);

  expect(await screen.findByText('Rejected')).toBeTruthy();
  expect(screen.getByText(/Name differs from the licence/)).toBeTruthy();
  expect(screen.getByText('Dakly shared sender')).toBeTruthy();
});

it('waits for approval and blocks a second request', async () => {
  show([sender({})]);

  expect(await screen.findByText('Requested')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Request a sender name' }).hasAttribute('disabled'),
  ).toBe(true);
});

it('sends a request with both uploaded documents', async () => {
  const user = userEvent.setup();
  show([]);
  await user.click(await screen.findByRole('button', { name: 'Request a sender name' }));
  const dialog = await screen.findByRole('dialog');

  await user.type(within(dialog).getByLabelText('Sender name'), 'Urban Trend');
  await user.upload(
    within(dialog).getByLabelText('Trade licence'),
    new File(['a'], 'licence.pdf', { type: 'application/pdf' }),
  );
  await user.upload(
    within(dialog).getByLabelText('NID of the owner'),
    new File(['b'], 'nid.png', { type: 'image/png' }),
  );
  await within(dialog).findByText('nid.png uploaded.');
  await user.click(within(dialog).getByRole('checkbox'));
  await user.click(within(dialog).getByRole('button', { name: 'Send request' }));

  await waitFor(() =>
    expect(
      requests.find((r) => r.method === 'POST' && r.url.endsWith('/sms-sender-ids'))?.body,
    ).toEqual({
      senderName: 'Urban Trend',
      tradeLicenceFileId: '00000001-0000-4000-8000-000000000000',
      nidFileId: '00000002-0000-4000-8000-000000000000',
    }),
  );
});

it('asks for the documents and the ownership tick before it sends', async () => {
  const user = userEvent.setup();
  show([]);
  await user.click(await screen.findByRole('button', { name: 'Request a sender name' }));
  const dialog = await screen.findByRole('dialog');

  await user.type(within(dialog).getByLabelText('Sender name'), 'Urban Trend');
  await user.click(within(dialog).getByRole('button', { name: 'Send request' }));

  expect(await within(dialog).findByText('Upload your trade licence')).toBeTruthy();
  expect(within(dialog).getByText('Upload your NID')).toBeTruthy();
  expect(within(dialog).getByText('Confirm that you own this brand name')).toBeTruthy();
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

it('hides the request button without edit access', async () => {
  show([], false);

  await screen.findByText('Dakly shared sender');
  expect(screen.queryByRole('button', { name: 'Request a sender name' })).toBeNull();
});
