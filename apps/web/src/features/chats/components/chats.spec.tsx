// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationResponse } from '@dakly/contracts/chats';
import type { CommentResponse } from '@dakly/contracts/comments';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { chatScreenQuerySchema } from '../chat-filters';
import { ChatsScreen } from './chats-screen';
import { ShellNavigationCollapse } from '@/components/shell-navigation-collapse';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const sadia: ConversationResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e5f',
  contactId: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e60',
  contactName: 'Sadia Islam',
  labels: [],
  channel: 'messenger',
  status: 'open',
  responder: 'ai',
  assigneeUserId: null,
  handoverReason: null,
  handoverSummary: null,
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

let connectionKinds: string[] = [];
let connectionsForbidden = false;

function respond(list: () => Response) {
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
    if (path.startsWith('/api/channel-connections') && connectionsForbidden)
      return Response.json(
        { error: { code: 'FORBIDDEN', message: 'No access' } },
        { status: 403, headers: { 'x-session-context': 'verified' } },
      );
    if (path.startsWith('/api/channel-connections'))
      return Response.json(
        { items: connectionKinds.map((kind) => ({ kind, status: 'active' })), nextCursor: null },
        { headers: { 'x-session-context': 'verified' } },
      );
    return sidebarResponse(path) ?? list();
  });
}

const ok = (items: ConversationResponse[]) =>
  Response.json({ items, nextCursor: null }, { headers: { 'x-session-context': 'verified' } });

let pastOrders: unknown[] = [];
let summary: unknown = { aiRepliesToday: 49, chatOrdersToday: { count: 7, totalPoisha: 2478000 } };
let autoReplyOn = true;

// The answers every chats screen asks for besides the chat itself.
function sidebarResponse(path: string) {
  const verified = { headers: { 'x-session-context': 'verified' } };
  if (path.startsWith('/api/conversations/counts')) return Response.json(counts, verified);
  if (path.startsWith('/api/conversations/summary')) return Response.json(summary, verified);
  if (path.startsWith('/api/conversations/assignees')) return Response.json([], verified);
  if (path.startsWith('/api/conversations/labels'))
    return Response.json(['VIP', 'Wholesale'], verified);
  if (path.startsWith('/api/ai-agent/settings'))
    return Response.json({ version: 1, isAutoReplyOn: autoReplyOn }, verified);
  if (path.startsWith('/api/orders?buyerContactId'))
    return Response.json({ items: pastOrders }, verified);
  return undefined;
}

let setNavigationCollapsed = vi.fn();

function show(query = defaults, access: Partial<SessionContext['currentStore']> = {}) {
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
      ...access,
    } as NonNullable<SessionContext['currentStore']>,
    contextTag: 'verified',
    hasMemberships: true,
  };
  client.setQueryData(sessionContextKey, context);
  return render(<ChatsScreen query={query} />, {
    wrapper: ({ children }) => (
      <ShellNavigationCollapse value={setNavigationCollapsed}>
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ShellNavigationCollapse>
    ),
  });
}

let wideScreen = true;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: wideScreen,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  wideScreen = true;
  setNavigationCollapsed = vi.fn();
  paths = [];
  connectionKinds = [];
  connectionsForbidden = false;
  pastOrders = [];
  autoReplyOn = true;
  summary = { aiRepliesToday: 49, chatOrdersToday: { count: 7, totalPoisha: 2478000 } };
});

describe('Header pills', () => {
  it('shows how many chats need you, the AI auto-reply state and the orders from chats today', async () => {
    respond(() => ok([sadia]));
    show();
    expect(await screen.findByText('1 need you')).toBeTruthy();
    expect(await screen.findByText('AI auto-reply on · 49 replies today')).toBeTruthy();
    expect(await screen.findByText('7 orders from chats today · ৳24,780')).toBeTruthy();
  });

  it('says the auto-reply is off and leaves out the order figures a member may not see', async () => {
    autoReplyOn = false;
    summary = { aiRepliesToday: 0, chatOrdersToday: null };
    respond(() => ok([sadia]));
    show();
    expect(await screen.findByText('AI auto-reply off · 0 replies today')).toBeTruthy();
    expect(screen.queryByText(/orders from chats today/)).toBeNull();
  });
});

describe('Bulk select', () => {
  const verified = { headers: { 'x-session-context': 'verified' } };
  const rumana = { ...sadia, id: 'chat-rumana', contactName: 'Rumana Akter' };
  const patches: { path: string; body: unknown }[] = [];

  function respondToList(failFor?: string) {
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patches.push({ path, body: JSON.parse(String(init.body)) });
        if (failFor && path.endsWith(failFor))
          return Response.json({ message: 'No' }, { status: 409, ...verified });
        return Response.json(sadia, verified);
      }
      return (
        sidebarResponse(path) ??
        (path.startsWith('/api/conversations/assignees')
          ? Response.json([{ userId: 'rina', name: 'Rina' }], verified)
          : ok([sadia, rumana]))
      );
    });
  }

  afterEach(() => {
    patches.length = 0;
  });

  it('marks the ticked chats done and leaves select mode', async () => {
    respondToList();
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Select' }));
    expect(screen.getByText('0 selected')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Sadia Islam' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Rumana Akter' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches.map(({ path }) => path)).toEqual([
      `/api/conversations/${sadia.id}`,
      '/api/conversations/chat-rumana',
    ]);
    expect(patches[0]!.body).toEqual({ status: 'done' });
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull());
  });

  it('keeps the chats selected and says so when some could not change', async () => {
    respondToList('chat-rumana');
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Sadia Islam' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Rumana Akter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByText(/1 of 2 chats could not be changed/)).toBeTruthy();
    expect(screen.getByText('2 selected')).toBeTruthy();
  });

  it('offers no Select button to a member who can only read chats', async () => {
    respondToList();
    show(defaults, { canEditChats: false });
    expect(await screen.findByText('Sadia Islam')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });
});

describe('Chat list', () => {
  it('collapses and reopens the Inbox folders', async () => {
    respond(() => ok([sadia]));
    show();
    const toggle = screen.getByRole('button', { name: 'Collapse inbox folders' });
    expect(screen.getByRole('navigation', { name: 'Chat tabs' })).toBeTruthy();
    await userEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: 'Expand inbox folders' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(screen.queryByRole('navigation', { name: 'Chat tabs' })).toBeNull();
    const toolbar = screen.getByRole('group', { name: 'Inbox controls' });
    expect(within(toolbar).getByRole('heading', { name: 'Inbox' })).toBeTruthy();
    expect(document.activeElement).toBe(
      within(toolbar).getByRole('button', { name: 'Expand inbox folders' }),
    );
    expect(await screen.findByText('Sadia Islam')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Expand inbox folders' }));
    expect(
      screen.getByRole('button', { name: 'Collapse inbox folders' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Chat tabs' })).toBeTruthy();
  });

  it('shows the main navigation as an icon rail while the Inbox is open', async () => {
    respond(() => ok([sadia]));
    const { unmount } = show();
    expect(await screen.findByText('Sadia Islam')).toBeTruthy();
    expect(setNavigationCollapsed).toHaveBeenLastCalledWith(true);
    unmount();
    expect(setNavigationCollapsed).toHaveBeenLastCalledWith(false);
  });

  it('starts with the Inbox folders collapsed on a narrow screen', async () => {
    wideScreen = false;
    respond(() => ok([sadia]));
    show();
    expect(await screen.findByText('Sadia Islam')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Chat tabs' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Expand inbox folders' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(screen.getByRole('combobox', { name: 'Chat folder' })).toBeTruthy();
  });

  it('says why a chat needs the team on its row', async () => {
    respond(() =>
      ok([{ ...sadia, status: 'needs_you', responder: 'human', handoverReason: 'refund' }]),
    );
    show();
    expect(await screen.findByText('Needs you · Refund or exchange')).toBeTruthy();
  });

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

  it('lists only the connected channels, with Comments for a Page or Instagram', async () => {
    connectionKinds = ['facebook_page', 'whatsapp'];
    respond(() => ok([]));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Channels' }));
    expect(await screen.findByRole('link', { name: 'Messenger' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Comments' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Instagram' })).toBeNull();
  });

  it('shows every channel to staff who cannot read the channel connections', async () => {
    connectionsForbidden = true;
    respond(() => ok([]));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Channels' }));
    expect(await screen.findByRole('link', { name: 'Instagram' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Comments' })).toBeTruthy();
  });

  it('hides the channel filter when only one channel is connected', async () => {
    connectionKinds = ['whatsapp'];
    respond(() => ok([]));
    show();
    await screen.findByText('No chats here yet.');
    await waitFor(() =>
      expect(paths.some((path) => path.startsWith('/api/channel-connections'))).toBe(true),
    );
    expect(screen.queryByRole('button', { name: 'Channels' })).toBeNull();
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

describe('Conversation', () => {
  const chatId = sadia.id;
  const inbound = {
    id: 'm1',
    kind: 'text',
    direction: 'in',
    body: 'Price koto?',
    authorType: 'customer',
    authorUserId: null,
    status: 'received',
    sourceType: 'chat',
    createdAt: '2026-11-19T04:03:00.000000Z',
    sentAt: null,
  };
  const verified = { headers: { 'x-session-context': 'verified' } };
  const posts: { path: string; body: unknown }[] = [];
  const saved: (typeof inbound)[] = [];

  function respondToThread(windowExpiresAt: string | null, failures = 0) {
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ path, body: JSON.parse(String(init.body ?? '{}')) });
        if (posts.length <= failures)
          return Response.json(
            { error: { code: 'CHAT_SEND_FAILED', message: 'Could not send reply' } },
            { ...verified, status: 503 },
          );
        saved.push({
          ...inbound,
          id: 'm2',
          direction: 'out',
          authorType: 'user',
          status: 'sent',
          body: (JSON.parse(String(init.body ?? '{}')) as { body: string }).body,
        });
        return Response.json({ messageId: 'sent' }, verified);
      }
      const sidebar = sidebarResponse(path);
      if (sidebar) return sidebar;
      if (path.startsWith(`/api/conversations/${chatId}/messages`))
        return Response.json({ items: [...saved, inbound], nextCursor: null }, verified);
      if (path.startsWith(`/api/conversations/${chatId}`))
        return Response.json({ ...sadia, unreadCount: 0, windowExpiresAt }, verified);
      if (path.startsWith('/api/saved-replies'))
        return Response.json(
          {
            items: [
              { id: 's1', title: 'Delivery time', body: 'Dhaka te 2 din lagbe', shortcut: null },
            ],
          },
          verified,
        );
      return ok([sadia]);
    });
  }

  afterEach(() => {
    posts.length = 0;
    saved.length = 0;
  });

  it('shows the thread with the reply window and sends a reply', async () => {
    respondToThread(new Date(Date.now() + 22 * 3_600_000).toISOString());
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    expect(await screen.findByText('Price koto?')).toBeTruthy();
    expect(await screen.findByText('Reply within 22 h')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Write a reply'), 'Ji, 1300 taka');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    // The words move from the box into the thread at once, before the server answers.
    expect((screen.getByLabelText('Write a reply') as HTMLTextAreaElement).value).toBe('');
    expect(await screen.findByText('Ji, 1300 taka')).toBeTruthy();
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.path).toBe(`/api/conversations/${chatId}/replies`);
    expect(posts[0]!.body).toMatchObject({ body: 'Ji, 1300 taka' });
  });

  it('keeps private note drafts out of replies and restores each draft when switching tabs', async () => {
    respondToThread(new Date(Date.now() + 3_600_000).toISOString());
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Write a reply'), 'Thanks for your message');
    await user.click(screen.getByRole('tab', { name: 'Internal note' }));
    const note = screen.getByLabelText<HTMLTextAreaElement>('Write an internal note');
    expect(note.value).toBe('');
    await user.type(note, 'Private customer follow-up');
    await user.click(screen.getByRole('tab', { name: 'Reply' }));
    expect(screen.getByLabelText<HTMLTextAreaElement>('Write a reply').value).toBe(
      'Thanks for your message',
    );
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(posts[0]?.body).toMatchObject({ body: 'Thanks for your message' }));
    await user.click(screen.getByRole('tab', { name: 'Internal note' }));
    expect(screen.getByLabelText<HTMLTextAreaElement>('Write an internal note').value).toBe(
      'Private customer follow-up',
    );
  });

  it('restores a failed reply and reuses its key only when the same text is retried', async () => {
    respondToThread(new Date(Date.now() + 3_600_000).toISOString(), 2);
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    const user = userEvent.setup();
    const input = await screen.findByLabelText<HTMLTextAreaElement>('Write a reply');
    await user.type(input, 'First reply');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(input.value).toBe('First reply'));
    expect(await screen.findByText('Could not send reply')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(input.value).toBe('First reply'));
    expect(posts).toHaveLength(2);
    expect(posts[1]?.body).toEqual(posts[0]?.body);

    await user.clear(input);
    await user.type(input, 'Edited reply');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2]?.body).toMatchObject({ body: 'Edited reply' });
    expect((posts[2]?.body as { operationKey: string }).operationKey).not.toBe(
      (posts[0]?.body as { operationKey: string }).operationKey,
    );
  });

  it('fills the box from a saved reply the staff member picks', async () => {
    respondToThread(new Date(Date.now() + 3_600_000).toISOString());
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    await userEvent.click(await screen.findByRole('button', { name: 'Saved replies' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delivery time/ }));
    expect((screen.getByLabelText('Write a reply') as HTMLTextAreaElement).value).toBe(
      'Dhaka te 2 din lagbe',
    );
  });

  it('saves an internal note and keeps the reply box off when the window is closed', async () => {
    respondToThread(null);
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    expect(await screen.findByText('Reply window closed')).toBeTruthy();
    expect((screen.getByLabelText('Write a reply') as HTMLTextAreaElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Internal note' }));
    await userEvent.type(screen.getByLabelText('Write an internal note'), 'Call at 5');
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.path).toBe(`/api/conversations/${chatId}/notes`);
  });
});

describe('Conversation actions', () => {
  const verified = { headers: { 'x-session-context': 'verified' } };
  const chatId = sadia.id;
  const sent: { method: string; path: string; body: unknown }[] = [];

  function respondToActions(chat: Partial<ConversationResponse>) {
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (init?.method && init.method !== 'GET') {
        sent.push({
          method: init.method,
          path,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        return Response.json({ ...sadia, ...chat }, verified);
      }
      if (path.startsWith('/api/conversations/assignees'))
        return Response.json(
          [
            { userId: 'member', name: 'Member' },
            { userId: 'rina', name: 'Rina' },
          ],
          verified,
        );
      if (path.startsWith(`/api/conversations/${chatId}/messages`))
        return Response.json({ items: [], nextCursor: null }, verified);
      if (path.startsWith(`/api/conversations/${chatId}`))
        return Response.json({ ...sadia, unreadCount: 0, ...chat }, verified);
      return sidebarResponse(path) ?? ok([sadia]);
    });
  }

  afterEach(() => {
    sent.length = 0;
  });

  it('takes over a chat the AI is handling', async () => {
    respondToActions({});
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    expect(await screen.findByText('Dakly AI is handling this chat')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: `/api/conversations/${chatId}/take-over`,
    });
    expect(
      await screen.findByText("You're handling this chat. Dakly AI paused here."),
    ).toBeTruthy();
  });

  it('adds, creates and removes labels', async () => {
    respondToActions({ labels: ['VIP'] });
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    await userEvent.click(await screen.findByRole('button', { name: /^Label/ }));
    expect(
      (await screen.findByRole('checkbox', { name: 'VIP' })).getAttribute('aria-checked'),
    ).toBe('true');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Wholesale' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      path: `/api/conversations/${chatId}/labels`,
      body: { label: 'Wholesale', change: 'add' },
    });
    await userEvent.click(screen.getByRole('checkbox', { name: 'VIP' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.body).toEqual({ label: 'VIP', change: 'remove' });
    await userEvent.type(screen.getByLabelText('New label'), ' Eid ');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]!.body).toEqual({ label: 'Eid', change: 'add' });
  });

  it('says so when the AI is assigned the chat but auto-reply is off', async () => {
    autoReplyOn = false;
    respondToActions({});
    show(chatScreenQuerySchema.parse({ chat: chatId }), { canEditStoreSettings: true });
    expect(
      await screen.findByText(/AI auto-reply is off, so Dakly AI will not answer/),
    ).toBeTruthy();
    expect(screen.queryByText('Dakly AI is handling this chat')).toBeNull();
    expect(screen.getByRole('link', { name: 'Turn on AI auto-reply' })).toBeTruthy();
    autoReplyOn = true;
  });

  it('shows the auto-reply-off notice without a link to someone who cannot change settings', async () => {
    autoReplyOn = false;
    respondToActions({});
    show(chatScreenQuerySchema.parse({ chat: chatId }), { canEditStoreSettings: false });
    expect(
      await screen.findByText(/AI auto-reply is off, so Dakly AI will not answer/),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Turn on AI auto-reply' })).toBeNull();
    autoReplyOn = true;
  });

  it('hands a chat back to the AI', async () => {
    respondToActions({ responder: 'human' });
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    await userEvent.click(await screen.findByRole('button', { name: 'Hand back to Dakly AI' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.path).toBe(`/api/conversations/${chatId}/return-to-ai`);
    expect(await screen.findByText('Dakly AI is handling this chat again.')).toBeTruthy();
  });

  it('shows the hand-over summary while people handle the chat, and not while the AI does', async () => {
    const summary = 'Karim, 01712345678, order 1042 not delivered. Checked: shipped by Pathao.';
    respondToActions({ responder: 'human', handoverReason: 'complaint', handoverSummary: summary });
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    expect(await screen.findByText('Your team is handling this chat')).toBeTruthy();
    expect(screen.getByText('· Complaint')).toBeTruthy();
    expect(screen.getByText(summary)).toBeTruthy();
    cleanup();
    respondToActions({ responder: 'ai', handoverSummary: null });
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    expect(await screen.findByText('Dakly AI is handling this chat')).toBeTruthy();
    expect(screen.queryByText(/Handover summary/)).toBeNull();
  });

  it('marks a chat done, and offers Reopen once it is', async () => {
    respondToActions({});
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'PATCH', body: { status: 'done' } });
    cleanup();
    respondToActions({ status: 'done' });
    show(chatScreenQuerySchema.parse({ chat: chatId }));
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('shows no actions to a member who can only read chats', async () => {
    respondToActions({});
    show(chatScreenQuerySchema.parse({ chat: chatId }), { canEditChats: false });
    expect(await screen.findByText('Dakly AI is handling this chat')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });
});

describe('Customer panel', () => {
  const chatId = sadia.id;
  const verified = { headers: { 'x-session-context': 'verified' } };
  const posts: { path: string; body: unknown }[] = [];
  const kurti = {
    id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e80',
    name: "Women's Kurti",
    isStockTracked: true,
    variants: [
      {
        id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e81',
        title: 'M',
        isDefault: false,
        pricePoisha: 130000,
        available: 3,
        photoUrl: null,
      },
      {
        id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e82',
        title: 'L',
        isDefault: false,
        pricePoisha: 130000,
        available: 0,
        photoUrl: null,
      },
    ],
  };

  function areasFor(path: string) {
    const parent = new URL(path, 'http://shop.test').searchParams.get('parentId');
    const items = parent
      ? [{ id: 301, name: 'Dhaka', parentId: 1 }]
      : [{ id: 1, name: 'Dhaka division', parentId: null }];
    return { items, nextCursor: null };
  }

  function respondToPanel() {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        return Response.json({ id: 'order-1', number: 1004 }, { status: 201, ...verified });
      }
      if (path.startsWith('/api/contacts/'))
        return Response.json(
          {
            id: sadia.contactId,
            name: 'Sadia Islam',
            phone: '01712345678',
            kind: 'chat_only',
            tags: [],
            createdAt: '2026-11-19T04:00:00Z',
          },
          verified,
        );
      if (path.startsWith('/api/orders/catalogue'))
        return Response.json({ items: [kurti], nextCursor: null }, verified);
      if (path.startsWith('/api/delivery-zones/charge'))
        return Response.json({ chargePoisha: 6000 }, verified);
      if (path.startsWith('/api/areas')) return Response.json(areasFor(path), verified);
      const sidebar = sidebarResponse(path);
      if (sidebar) return sidebar;
      if (path.startsWith(`/api/conversations/${chatId}/messages`))
        return Response.json({ items: [], nextCursor: null }, verified);
      if (path.startsWith(`/api/conversations/${chatId}`))
        return Response.json({ ...sadia, unreadCount: 0 }, verified);
      return ok([sadia]);
    });
  }

  afterEach(() => {
    posts.length = 0;
  });

  it('shows the customer status, name and phone', async () => {
    respondToPanel();
    show(chatScreenQuerySchema.parse({ chat: chatId }), {
      canViewCustomers: true,
      canEditOrders: true,
    });
    expect(await screen.findByText('Not a lead yet')).toBeTruthy();
    expect(await screen.findByText('01712345678')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open profile' }).getAttribute('href')).toBe(
      `/customers/${sadia.contactId}`,
    );
  });

  it('shows a new customer with no delivery history, and keeps the Media and Ask Dakly tabs off', async () => {
    pastOrders = [];
    respondToPanel();
    show(chatScreenQuerySchema.parse({ chat: chatId }), { canViewOrders: true });
    expect(await screen.findByText('New customer')).toBeTruthy();
    expect(screen.getByText('No delivery history yet.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Order' }).getAttribute('data-state')).toBe('active');
    expect((screen.getByRole('tab', { name: 'Media' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('tab', { name: 'Ask Dakly' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("lists the customer's latest orders as their delivery history", async () => {
    pastOrders = [
      {
        id: 'o1',
        number: 1064,
        itemPreview: "Women's Kurti (M)",
        recipientName: 'Sadia',
        stage: 'to_pack',
      },
    ];
    respondToPanel();
    show(chatScreenQuerySchema.parse({ chat: chatId }), { canViewOrders: true });
    expect(await screen.findByText('Delivery history')).toBeTruthy();
    expect(screen.getByText("#1064 Women's Kurti (M)")).toBeTruthy();
    expect(screen.getByText('To pack')).toBeTruthy();
    pastOrders = [];
  });

  it('makes an order for the chat from the form', async () => {
    respondToPanel();
    show(chatScreenQuerySchema.parse({ chat: chatId }), {
      canViewCustomers: true,
      canEditOrders: true,
    });
    await screen.findByRole('option', { name: "Women's Kurti" });
    await userEvent.selectOptions(screen.getByLabelText('Product'), kurti.id);
    expect(await screen.findByRole('option', { name: 'L · sold out' })).toHaveProperty(
      'disabled',
      true,
    );
    await userEvent.selectOptions(screen.getByLabelText('Size'), kurti.variants[0]!.id);
    await userEvent.type(screen.getByLabelText('Address'), 'Mirpur 10');
    await userEvent.selectOptions(await screen.findByLabelText('Division'), '1');
    await userEvent.selectOptions(await screen.findByLabelText('District'), '301');
    expect(await screen.findByText('৳1,360')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Create order' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.path).toBe(`/api/conversations/${chatId}/orders`);
    expect(posts[0]!.body).toMatchObject({
      recipient: { name: 'Sadia Islam', phone: '01712345678', address: 'Mirpur 10', areaId: 301 },
      items: [{ variantId: kurti.variants[0]!.id, quantity: 1 }],
    });
    expect(await screen.findByText(/Order #1004 created/)).toBeTruthy();
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
