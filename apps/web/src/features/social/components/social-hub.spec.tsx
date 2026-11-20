// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { ChannelConnection } from '@dakly/contracts/channels';
import type { PostResponse } from '@dakly/contracts/social';

import { SocialHubScreen } from './social-hub-screen';
import { sessionContextKey } from '@/lib/session-context';

const page: ChannelConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'facebook_page',
  displayName: 'Urban Trend',
  externalAccountId: '1001',
  status: 'active',
  tokenExpiresAt: null,
  connectedAt: '2026-11-01T06:00:00.000Z',
  disconnectedAt: null,
};
const instagram: ChannelConnection = {
  ...page,
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'instagram',
  displayName: '@urbantrend.bd',
  status: 'needs_reconnect',
  tokenExpiresAt: '2026-11-05T06:00:00.000Z',
};
const draft = (overrides: Partial<PostResponse>): PostResponse => ({
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'post',
  caption: 'Mustard silk scarves are back in stock.',
  mediaFileIds: [],
  linkUrl: null,
  firstComment: null,
  isAiWritten: false,
  createdByUserId: 'user-1',
  approvedByUserId: null,
  approvedAt: null,
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:20:00.000Z',
  targets: [
    {
      id: 't1',
      channelConnectionId: page.id,
      captionOverride: null,
      status: 'draft',
      scheduledFor: null,
      publishedAt: null,
      externalPostId: null,
      errorCode: null,
      errorMessage: null,
    },
  ],
  ...overrides,
});

function show({ connections = [page], drafts = [draft({})] } = {}) {
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json(
      { items: url.includes('/channel-connections') ? connections : drafts, nextCursor: null },
      { headers: { 'x-session-context': 'verified' } },
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true, canEditStoreSettings: true },
  });
  render(
    <QueryClientProvider client={client}>
      <SocialHubScreen />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('lists each account with its status, TikTok as coming soon and a reconnect banner', async () => {
  show({ connections: [page, instagram] });
  const channels = await screen.findByRole('region', { name: 'Connected channels' });
  const names = within(channels)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('p')?.textContent);
  expect(names).toEqual(['Urban Trend', '@urbantrend.bd', 'TikTok']);
  expect(within(channels).getByText('2 accounts connected')).toBeTruthy();
  expect(within(channels).getByText('Connected')).toBeTruthy();
  expect(within(channels).getByText('Access expired')).toBeTruthy();
  expect(within(channels).getByText(/Coming soon/)).toBeTruthy();
  const banner = screen.getByRole('region', { name: 'Reconnect @urbantrend.bd' });
  expect(within(banner).getByText(/expired on Nov 5/)).toBeTruthy();
  expect(
    within(banner).getByRole('link', { name: 'Reconnect Instagram' }).getAttribute('href'),
  ).toBe('/integrations');
});

it('shows a draft with its accounts and warns when it has no caption or photo', async () => {
  show({ drafts: [draft({}), draft({ id: 'empty', caption: null })] });
  const drafts = await screen.findByRole('region', { name: 'Drafts' });
  expect(
    within(drafts).getByText('2 drafts · only you can see these until you schedule them'),
  ).toBeTruthy();
  expect(within(drafts).getByText('Mustard silk scarves are back in stock.')).toBeTruthy();
  expect(within(drafts).getByText('No caption yet')).toBeTruthy();
  expect(within(drafts).getAllByText('Add a caption or photo')).toHaveLength(1);
  expect(within(drafts).getAllByText(/Facebook · Post · Edited Nov 6, 4:20 pm/)).toHaveLength(2);
});

it('marks an AI-written draft that nobody approved yet', async () => {
  show({ drafts: [draft({ isAiWritten: true })] });
  expect(await screen.findByText('Needs your OK')).toBeTruthy();
});
