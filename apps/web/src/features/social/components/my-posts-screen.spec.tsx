// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ChannelConnection } from '@dakly/contracts/channels';
import type { PostResponse } from '@dakly/contracts/social';

import { MyPostsScreen } from './my-posts-screen';
import { sessionContextKey } from '@/lib/session-context';

const replace = vi.fn();
let query = 'view=list&date=2026-11-06';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/social/posts',
  useSearchParams: () => new URLSearchParams(query),
}));

const connection = (overrides: Partial<ChannelConnection>): ChannelConnection => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'facebook_page',
  displayName: 'Urban Trend',
  externalAccountId: '1001',
  status: 'active',
  tokenExpiresAt: null,
  connectedAt: '2026-11-01T06:00:00.000Z',
  disconnectedAt: null,
  ...overrides,
});
const page = connection({});
const instagram = connection({
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'instagram',
  displayName: '@urbantrend.bd',
  status: 'needs_reconnect',
  tokenExpiresAt: '2026-11-05T06:00:00.000Z',
});

type Target = PostResponse['targets'][number];

const post = (id: string, caption: string, target: Partial<Target>): PostResponse => ({
  id,
  kind: 'post',
  caption,
  mediaFileIds: ['photo'],
  photos: [],
  linkUrl: null,
  firstComment: null,
  isAiWritten: false,
  createdByUserId: 'user-1',
  approvedByUserId: null,
  approvedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  targets: [
    {
      id: `${id}-t`,
      channelConnectionId: page.id,
      captionOverride: null,
      status: 'scheduled',
      scheduledFor: '2026-11-07T06:30:00.000Z',
      publishedAt: null,
      externalPostId: null,
      errorCode: null,
      errorMessage: null,
      reach: null,
      reactions: null,
      comments: null,
      linkTaps: null,
      ...target,
    },
  ],
});

const requests: { method: string; url: string; body?: string }[] = [];

function show(posts: PostResponse[]) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const headers = { 'x-session-context': 'verified' };
    if (init.method === 'POST') {
      requests.push({ method: 'POST', url, body: init.body as string });
      return Response.json(posts[0], { headers });
    }
    if (url.includes('/channel-connections'))
      return Response.json({ items: [page, instagram], nextCursor: null }, { headers });
    return Response.json({ items: posts, nextCursor: null }, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true, canEditSocial: true, canEditStoreSettings: true },
  });
  render(
    <QueryClientProvider client={client}>
      <MyPostsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  requests.length = 0;
  cleanup();
  vi.unstubAllGlobals();
  replace.mockClear();
  query = 'view=list&date=2026-11-06';
});

it('counts upcoming and published posts and tells how many Instagram posts are blocked', async () => {
  show([
    post('a', 'Weekend sale', {}),
    post('b', 'Reel for Instagram', {
      channelConnectionId: instagram.id,
      scheduledFor: '2026-11-08T14:00:00.000Z',
    }),
    post('c', 'Mustard scarves', {
      status: 'published',
      publishedAt: '2026-11-02T14:00:00.000Z',
      reach: 1200,
    }),
  ]);
  expect(await screen.findByRole('tab', { name: /Calendar/ })).toHaveProperty(
    'textContent',
    'Calendar2',
  );
  expect(screen.getByRole('tab', { name: /Published/ }).textContent).toBe('Published1');
  const banner = screen.getByRole('region', { name: 'Reconnect @urbantrend.bd' });
  expect(within(banner).getByText(/1 scheduled Instagram post won’t publish/)).toBeTruthy();
});

it('lists the month by day with each post’s state, and filters by account in the URL', async () => {
  show([post('a', 'Weekend sale', {})]);
  const row = await screen.findByRole('button', { name: /Weekend sale/ });
  expect(row.textContent).toContain('Scheduled');
  expect(row.textContent).toContain('12:30 pm');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(replace).toHaveBeenCalledWith(expect.stringContaining('date=2026-12-01'), {
    scroll: false,
  });
});

it('shows results for a published post and a prompt when nothing is planned', async () => {
  query = 'tab=published';
  show([
    post('c', 'Mustard scarves', {
      status: 'published',
      publishedAt: '2026-11-02T14:00:00.000Z',
      reach: 1200,
      reactions: 80,
    }),
  ]);
  const list = await screen.findByRole('region', { name: 'Published posts' });
  expect(within(list).getByText('1,200')).toBeTruthy();
  expect(within(list).getAllByText('—')).toHaveLength(2);
});

it('offers Plan your first post when there are no posts', async () => {
  show([]);
  expect(await screen.findByText('No posts planned yet.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Plan your first post' }).getAttribute('href')).toBe(
    '/social/posts/new',
  );
});

it('moves a scheduled post to the day it is dropped on and keeps its time', async () => {
  query = 'view=month&date=2026-11-06';
  show([post('a', 'Weekend sale', {})]);
  await screen.findByRole('button', { name: /Weekend sale/ });
  const cell = screen.getByText('12', { selector: 'time' }).closest('[role="gridcell"]')!;

  fireEvent.drop(cell, { dataTransfer: { getData: () => 'a' } });

  expect(await screen.findByText(/Moved “Weekend sale” to Nov 12/)).toBeTruthy();
  expect(requests).toEqual([
    {
      method: 'POST',
      url: expect.stringContaining('/posts/a/reschedule'),
      body: JSON.stringify({ scheduledFor: '2026-11-12T12:30:00+06:00' }),
    },
  ]);
});

it('shows the reason when the server refuses the move', async () => {
  query = 'view=month&date=2026-11-06';
  show([post('a', 'Weekend sale', {})]);
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const headers = { 'x-session-context': 'verified' };
    if (init.method === 'POST')
      return Response.json(
        {
          error: { code: 'POST_SLOT_TAKEN', message: 'An account already has a post at this time' },
        },
        { status: 409, headers },
      );
    if (url.includes('/channel-connections'))
      return Response.json({ items: [page, instagram], nextCursor: null }, { headers });
    return Response.json({ items: [post('a', 'Weekend sale', {})], nextCursor: null }, { headers });
  });
  await screen.findByRole('button', { name: /Weekend sale/ });
  const cell = screen.getByText('12', { selector: 'time' }).closest('[role="gridcell"]')!;

  fireEvent.drop(cell, { dataTransfer: { getData: () => 'a' } });

  expect((await screen.findByRole('alert')).textContent).toBe(
    'An account already has a post at this time',
  );
});

it('moves a post from the details dialog with a date and time, for people who can schedule', async () => {
  query = 'view=list&date=2026-11-06';
  show([post('a', 'Weekend sale', {})]);
  await userEvent.click(await screen.findByRole('button', { name: /Weekend sale/ }));
  const dialog = screen.getByRole('dialog');

  fireEvent.change(within(dialog).getByLabelText('Move to'), {
    target: { value: '2026-11-14T09:15' },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

  expect(await screen.findByText(/Moved “Weekend sale” to Nov 14/)).toBeTruthy();
  expect(requests).toEqual([
    {
      method: 'POST',
      url: expect.stringContaining('/posts/a/reschedule'),
      body: JSON.stringify({ scheduledFor: '2026-11-14T09:15:00+06:00' }),
    },
  ]);
});

it('offers no move field for a published post', async () => {
  query = 'view=list&date=2026-11-06';
  show([
    post('c', 'Mustard scarves', { status: 'published', publishedAt: '2026-11-02T14:00:00.000Z' }),
  ]);
  await userEvent.click(await screen.findByRole('button', { name: /Mustard scarves/ }));

  expect(screen.queryByLabelText('Move to')).toBeNull();
});
