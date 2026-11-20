// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
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
  isAiLive: false,
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
      ...target,
    },
  ],
});

function show(posts: PostResponse[]) {
  vi.stubGlobal('fetch', async (url: string) => {
    const headers = { 'x-session-context': 'verified' };
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockClear();
  query = 'view=list&date=2026-11-06';
});

it('tells how many scheduled Instagram posts are blocked by the expired account', async () => {
  show([
    post('a', 'Weekend sale', {}),
    post('b', 'Reel for Instagram', {
      channelConnectionId: instagram.id,
      scheduledFor: '2026-11-08T14:00:00.000Z',
    }),
    post('c', 'Mustard scarves', {
      status: 'published',
      publishedAt: '2026-11-02T14:00:00.000Z',
    }),
  ]);
  const banner = await screen.findByRole('region', { name: 'Reconnect @urbantrend.bd' });
  expect(within(banner).getByText(/1 scheduled Instagram post won’t publish/)).toBeTruthy();
});

it('lists the month by day with each post’s state, and moves to the next month in the URL', async () => {
  show([post('a', 'Weekend sale', {})]);
  const row = (await screen.findByText('Weekend sale')).closest('li')!;
  expect(row.textContent).toContain('Scheduled');
  expect(row.textContent).toContain('12:30 pm');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(replace).toHaveBeenCalledWith(expect.stringContaining('date=2026-12-01'), {
    scroll: false,
  });
});

it('offers Plan your first post when there are no posts', async () => {
  show([]);
  expect(await screen.findByText('No posts planned yet.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Plan your first post' }).getAttribute('href')).toBe(
    '/social/posts/new',
  );
});
