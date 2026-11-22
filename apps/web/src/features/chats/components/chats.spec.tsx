// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationResponse } from '@dakly/contracts/chats';
import type { CommentResponse } from '@dakly/contracts/comments';
import type { SessionContext } from '@dakly/contracts/sessions';

import { chatScreenQuerySchema } from '../chat-filters';
import { ChatsScreen } from './chats-screen';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

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
      canViewDueBook: false,
      canEditDueBook: false,
      canViewCampaigns: false,
      canViewAnalytics: false,
      canChangeAttributionWindow: false,
      canEditCampaigns: false,
      canViewAutomations: false,
      canEditAutomations: false,
      canViewCustomers: false,
      canCreateCustomer: false,
      canExportCustomers: false,
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

const kurtiComment: CommentResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e70',
  channel: 'messenger',
  externalPostId: 'post-1',
  postCaption: 'Women’s Kurti ৳850',
  authorName: 'Rumana Akter',
  body: 'Price koto?',
  classification: null,
  status: 'new',
  isReply: false,
  publicReplied: false,
  privateRepliedAt: null,
  canReplyPrivately: true,
  commentedAt: '2026-11-19T04:00:00.000000Z',
};

describe('Comments view', () => {
  function respondWithComments(items: CommentResponse[]) {
    const calls: { path: string; method: string }[] = [];
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method ?? 'GET' });
      const headers = { 'x-session-context': 'verified' };
      if (path.startsWith('/api/comments/') && init?.method === 'POST')
        return Response.json({ ...items[0], status: 'hidden' }, { headers });
      return Response.json({ items, nextCursor: null }, { headers });
    });
    return calls;
  }
  const commentsQuery = chatScreenQuerySchema.parse({ channel: 'comments', post: 'post-1' });

  it('lists the posts with how many comments wait, and opens one post with its comments', async () => {
    respondWithComments([kurtiComment, { ...kurtiComment, id: 'second', status: 'replied' }]);
    show(commentsQuery);
    expect(await screen.findByText('2 comments')).toBeTruthy();
    expect(screen.getByText('To answer:').parentElement?.textContent).toBe('To answer: 1');
    expect(screen.getAllByText('Rumana Akter')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Women’s Kurti ৳850' })).toBeTruthy();
  });

  it('hides a comment through the API', async () => {
    const calls = respondWithComments([kurtiComment]);
    show(commentsQuery);
    await userEvent.click(await screen.findByRole('button', { name: 'Hide comment' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        path: `/api/comments/${kurtiComment.id}/hide`,
        method: 'POST',
      }),
    );
  });

  it('turns the private reply off once Meta would refuse it', async () => {
    respondWithComments([{ ...kurtiComment, canReplyPrivately: false }]);
    show(commentsQuery);
    const button = await screen.findByRole('button', { name: /Send price by Messenger/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
