// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ChannelConnection } from '@dakly/contracts/channels';

import { IntegrationsScreen } from './integrations-screen';
import { sessionContextKey } from '@/lib/session-context';

const connection = (overrides: Partial<ChannelConnection>): ChannelConnection => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'facebook_page',
  displayName: 'Rina’s Shop',
  externalAccountId: '1001001',
  status: 'active',
  tokenExpiresAt: null,
  isAiLive: false,
  connectedAt: '2026-11-01T06:00:00.000Z',
  disconnectedAt: null,
  ...overrides,
});

type Setup = {
  items?: ChannelConnection[];
  senders?: unknown[];
  canEdit?: boolean;
};
const requests: { method: string; url: string }[] = [];
function show({ items = [], senders = [], canEdit = true }: Setup = {}) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ method: init.method ?? 'GET', url });
    if (init.method === 'DELETE')
      return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
    const body = url.includes('sms-sender-ids')
      ? { items: senders, nextCursor: null }
      : { items, nextCursor: null };
    return Response.json(body, { headers: { 'x-session-context': 'verified' } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewStoreSettings: true, canEditStoreSettings: canEdit },
  });
  render(
    <QueryClientProvider client={client}>
      <IntegrationsScreen />
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

it('offers to connect Messenger and Instagram, shows WhatsApp as waiting and SMS on the shared sender', async () => {
  show();
  const messenger = await screen.findByRole('region', { name: 'Messenger' });
  expect(within(messenger).getByRole('button', { name: 'Connect Facebook Page' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Connect Instagram' })).toBeTruthy();
  const whatsapp = screen.getByRole('region', { name: 'WhatsApp' });
  expect(within(whatsapp).getByText('Waiting for setup')).toBeTruthy();
  expect(within(whatsapp).queryByRole('button')).toBeNull();
  expect(screen.getByText('Your SMS go out from Dakly’s shared sender.')).toBeTruthy();
  expect(screen.getByText('0 connected')).toBeTruthy();
});

it('lists a connected Page, and a Page that needs reconnecting asks to reconnect', async () => {
  show({
    items: [
      connection({}),
      connection({
        id: '22222222-2222-4222-8222-222222222222',
        displayName: 'Karim’s Shop',
        externalAccountId: '1001002',
        status: 'needs_reconnect',
      }),
    ],
  });
  const messenger = await screen.findByRole('region', { name: 'Messenger' });
  expect(within(messenger).getByText('Connected')).toBeTruthy();
  expect(within(messenger).getByText('Needs reconnect')).toBeTruthy();
  expect(within(messenger).getAllByRole('button', { name: 'Reconnect' })).toHaveLength(1);
  expect(screen.getByText('2 connected')).toBeTruthy();
});

it('warns when Facebook access ends within seven days', async () => {
  show({
    items: [connection({ tokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString() })],
  });
  expect(await screen.findByText('Access ends soon')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
});

it('disconnects only after the shop confirms', async () => {
  show({ items: [connection({})] });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
  const dialog = screen.getByRole('dialog', { name: 'Disconnect Rina’s Shop?' });
  expect(requests.some(({ method }) => method === 'DELETE')).toBe(false);
  await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
  await screen.findByText('Rina’s Shop disconnected.');
  expect(requests).toContainEqual({
    method: 'DELETE',
    url: '/api/channel-connections/11111111-1111-4111-8111-111111111111',
  });
});

it('shows the SMS sender status and hides every change button from a member who cannot edit', async () => {
  show({
    items: [connection({})],
    canEdit: false,
    senders: [{ id: 's', senderName: 'RINASHOP', status: 'in_review', rejectionReason: null }],
  });
  expect(await screen.findByText('In review')).toBeTruthy();
  expect(screen.getByText(/RINASHOP is waiting for approval/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
