// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationResponse } from '@dakly/contracts/chats';
import type { SessionContext } from '@dakly/contracts/sessions';

import { chatScreenQuerySchema } from '../chat-filters';
import { ChatsScreen } from './chats-screen';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const sadia: ConversationResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e5f',
  contactId: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e60',
  contactName: 'Sadia Islam',
  channel: 'messenger',
  status: 'open',
  responder: 'ai',
  assigneeUserId: null,
  handoverReason: null,
  handedOverAt: null,
  aiResumesAt: null,
  lastMessageAt: '2026-11-19T04:03:00.000000Z',
  lastMessagePreview: 'Price koto? Mirpur e delivery charge koto?',
  windowExpiresAt: null,
  unreadCount: 3,
};
const counts = { all: 13, needsYou: 1, aiHandling: 9, followUp: 1 };
const defaults = chatScreenQuerySchema.parse({});

let paths: string[] = [];

function respond(list: () => Response) {
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
    if (path.startsWith('/api/conversations/counts'))
      return Response.json(counts, { headers: { 'x-session-context': 'verified' } });
    return list();
  });
}

const ok = (items: ConversationResponse[]) =>
  Response.json({ items, nextCursor: null }, { headers: { 'x-session-context': 'verified' } });

function show(query = defaults) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: SessionContext = {
    user: { id: 'member', name: 'Member' },
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewProducts: false,
      canEditProducts: false,
      canViewOrders: false,
      canEditOrders: false,
      canViewCampaigns: false,
      canEditCampaigns: false,
      canViewSocial: false,
      canEditSocial: false,
      canViewAutomations: false,
      canEditAutomations: false,
      canViewCustomers: false,
      canCreateCustomer: false,
      canViewSocial: false,
      canEditSocial: false,
      canViewChats: true,
      canEditChats: true,
      canViewSegments: false,
      canEditSegments: false,
      canViewTeam: false,
      canEditTeam: false,
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
  return render(<ChatsScreen query={query} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  paths = [];
});

describe('Chat list', () => {
  it('shows each chat with its name, last message and unread count, and the tab counts', async () => {
    respond(() => ok([sadia]));
    show();
    expect(await screen.findByText('Sadia Islam')).toBeTruthy();
    expect(screen.getByText('Price koto? Mirpur e delivery charge koto?')).toBeTruthy();
    expect(screen.getByText('Unread:').parentElement?.textContent).toBe('Unread: 3');
    expect(await screen.findByRole('link', { name: /AI handling\s*9/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /All\s*13/ }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('asks for the chats of the chosen tab and channel', async () => {
    respond(() => ok([]));
    show(chatScreenQuerySchema.parse({ tab: 'needs-you', channel: 'whatsapp' }));
    expect(await screen.findByText('No chats here yet.')).toBeTruthy();
    const list = paths.find((path) => path.startsWith('/api/conversations?'))!;
    const params = new URL(list, 'http://shop.test').searchParams;
    expect(params.get('status')).toBe('needs_you');
    expect(params.get('channel')).toBe('whatsapp');
  });

  it('offers a retry when the list fails', async () => {
    respond(() =>
      Response.json(
        { error: { code: 'CHATS_DISABLED', message: 'Chats is not turned on' } },
        { status: 403, headers: { 'x-session-context': 'verified' } },
      ),
    );
    show();
    expect(await screen.findByText('Chats is not turned on')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry chats' })).toBeTruthy();
  });
});
