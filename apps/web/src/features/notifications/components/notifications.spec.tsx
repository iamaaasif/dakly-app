// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationResponse } from '@dakly/contracts/notifications';

import { NotificationBell } from './notification-bell';
import { sessionContextKey } from '@/lib/session-context';

const navigation = vi.hoisted(() => ({ search: '', replaced: [] as string[] }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: (url: string) => navigation.replaced.push(url) }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const reconnect: NotificationResponse = {
  id: '01930b4e-7c1a-7000-8000-000000000001',
  type: 'channel.needs_reconnect',
  category: 'fix_now',
  priority: 1,
  title: 'Reconnect your Facebook page',
  body: 'Dhaka Threads stopped receiving Messenger chats.',
  actionUrl: '/settings',
  status: 'new',
  snoozedUntil: null,
  createdAt: '2026-11-16T04:00:00.000Z',
};

type Reply = (url: URL, init: RequestInit) => Response | Promise<Response>;
function serve(reply: Reply) {
  const requests: { url: URL; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const url = new URL(path, 'http://localhost');
    requests.push({ url, init });
    const response = await reply(url, init);
    response.headers.set('x-session-context', 'verified');
    return response;
  });
  return requests;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, { contextTag: 'verified', currentStore: { id: 'shop' } });
  render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}

const page = (items: NotificationResponse[]) => Response.json({ items, nextCursor: null });

beforeEach(() => {
  navigation.search = 'notifications=all';
  navigation.replaced = [];
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Notification bell and list', () => {
  it('shows a loading state while the list loads', async () => {
    serve((url) => (url.searchParams.get('status') ? page([]) : new Promise(() => undefined)));
    show();
    expect(await screen.findByText('Loading notifications…')).toBeTruthy();
  });

  it('shows the API error and retries the list', async () => {
    let failing = true;
    serve((url) => {
      if (url.searchParams.get('status')) return page([]);
      return failing
        ? Response.json(
            { error: { code: 'UNAVAILABLE', message: 'Notifications are not available' } },
            { status: 503 },
          )
        : page([reconnect]);
    });
    show();
    await screen.findByText('Notifications are not available');
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry notifications' }));
    expect(await screen.findByText('Reconnect your Facebook page')).toBeTruthy();
  });

  it('shows an empty state when the tab has no notifications', async () => {
    serve(() => page([]));
    show();
    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open notifications, 0 unread' })).toBeTruthy();
  });

  it('shows the unread count and the cards of the tab in the URL', async () => {
    navigation.search = 'notifications=fix_now';
    const requests = serve(() => page([reconnect]));
    show();
    const card = (await screen.findByText('Reconnect your Facebook page')).closest(
      'div',
    )!.parentElement!;
    expect(within(card).getByText('New')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('button', { name: 'Open notifications, 1 unread' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fix now' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    const list = requests.find(({ url }) => !url.searchParams.get('status'))!;
    expect(list.url.searchParams.get('category')).toBe('fix_now');
    await userEvent.click(screen.getByRole('button', { name: 'Billing' }));
    expect(navigation.replaced).toEqual(['/dashboard?notifications=billing']);
  });

  it('marks a card done and refreshes the unread count', async () => {
    let status: NotificationResponse['status'] = 'new';
    serve((url, init) => {
      if (init.method === 'POST') {
        status = 'done';
        return new Response(null, { status: 204 });
      }
      if (url.searchParams.get('status') === 'new')
        return page(status === 'new' ? [reconnect] : []);
      return page([{ ...reconnect, status }]);
    });
    show();
    await screen.findByRole('button', { name: 'Open notifications, 1 unread' });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('button', { name: 'Open notifications, 0 unread' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Done' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Mark seen' })).toBeNull();
    expect(screen.getByText('Done', { selector: 'span' })).toBeTruthy();
  });

  it('snoozes a card until the picked time and shows a refused change', async () => {
    const requests = serve((_url, init) =>
      init.method === 'POST'
        ? Response.json(
            {
              error: {
                code: 'SNOOZE_NOT_IN_FUTURE',
                message: 'Choose a snooze time in the future',
              },
            },
            { status: 400 },
          )
        : page([reconnect]),
    );
    show();
    await screen.findByText('Reconnect your Facebook page');
    await userEvent.click(screen.getByText('Snooze', { selector: 'summary' }));
    fireEvent.change(screen.getByLabelText('Snooze until'), {
      target: { value: '2026-11-20T09:30' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Snooze' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Choose a snooze time in the future',
    );
    const snooze = requests.find(({ init }) => init.method === 'POST')!;
    expect(snooze.url.pathname).toBe(`/api/notifications/${reconnect.id}/snooze`);
    expect(JSON.parse(String(snooze.init.body))).toEqual({
      until: new Date('2026-11-20T09:30').toISOString(),
    });
  });

  it('asks for a snooze time before sending', async () => {
    const requests = serve(() => page([reconnect]));
    show();
    await screen.findByText('Reconnect your Facebook page');
    await userEvent.click(screen.getByText('Snooze', { selector: 'summary' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Snooze' }).closest('form')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(requests.some(({ init }) => init.method === 'POST')).toBe(false);
  });

  it('hides the bell without a current shop', () => {
    const client = new QueryClient();
    client.setQueryData(sessionContextKey, { contextTag: 'verified', currentStore: null });
    render(
      <QueryClientProvider client={client}>
        <NotificationBell />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: /Open notifications/ })).toBeNull();
  });
});
