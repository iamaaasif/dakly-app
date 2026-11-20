// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
  photos: [],
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

const requests: { method: string; url: string; body?: string }[] = [];
function show({
  connections = [page],
  drafts = [draft({})],
  canEdit = true,
  rejectCopy = false,
} = {}) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ method: init.method ?? 'GET', url, body: init.body as string | undefined });
    const headers = { 'x-session-context': 'verified' };
    if (init.method === 'DELETE') return new Response(null, { status: 204, headers });
    if (url.includes('queue-slots') && init.method === 'PUT')
      return Response.json(
        { ...JSON.parse(init.body as string), timeZone: 'Asia/Dhaka' },
        { headers },
      );
    if (url.includes('queue-slots'))
      return Response.json(
        {
          channelConnectionId: page.id,
          timeZone: 'Asia/Dhaka',
          slots: [
            { weekday: 5, time: '11:00' },
            { weekday: 5, time: '20:00' },
          ],
        },
        { headers },
      );
    if (url.includes('/channel-connections'))
      return Response.json({ items: connections, nextCursor: null }, { headers });
    if (init.method === 'POST' && rejectCopy)
      return Response.json(
        { error: { code: 'POST_CONNECTION_NOT_FOUND', message: 'Connected account not found' } },
        { status: 404, headers },
      );
    if (init.method === 'POST') return Response.json(draft({ id: 'copy' }), { headers });
    return Response.json({ items: drafts, nextCursor: null }, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true, canEditSocial: canEdit, canEditStoreSettings: true },
  });
  render(
    <QueryClientProvider client={client}>
      <SocialHubScreen />
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
  expect(within(banner).getByRole('button', { name: 'Reconnect Instagram' })).toBeTruthy();
});

it('opens the connect dialog from Connect account and from Reconnect', async () => {
  const user = userEvent.setup();
  show({ connections: [page, instagram] });
  await user.click(await screen.findByRole('button', { name: 'Connect account' }));
  const chooser = screen.getByRole('dialog', { name: 'Connect account' });
  expect(within(chooser).getByText('Coming soon')).toBeTruthy();
  await user.click(within(chooser).getByRole('radio', { name: /Instagram business account/ }));
  await user.click(within(chooser).getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('dialog', { name: /Connect/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Back' }));
  const row = screen.getByText('@urbantrend.bd').closest('li')!;
  await user.click(within(row).getByRole('button', { name: 'Reconnect' }));
  expect(await screen.findByRole('dialog', { name: 'Reconnect @urbantrend.bd' })).toBeTruthy();
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

it('shows the first photo of a draft as its thumbnail', async () => {
  const photos = [{ id: 'photo-1', url: 'https://storage.test/photo-1.jpg' }];
  show({ drafts: [draft({ mediaFileIds: ['photo-1'], photos })] });
  const drafts = await screen.findByRole('region', { name: 'Drafts' });
  const thumbnail = drafts.querySelector('img');
  expect(thumbnail?.getAttribute('src')).toBe('https://storage.test/photo-1.jpg');
});

it('marks an AI-written draft that nobody approved yet', async () => {
  show({ drafts: [draft({ isAiWritten: true })] });
  expect(await screen.findByText('Needs your OK')).toBeTruthy();
});

it('deletes a draft only after confirmation', async () => {
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole('button', { name: /^Delete draft:/ }));
  const dialog = screen.getByRole('dialog');
  expect(requests.some(({ method }) => method === 'DELETE')).toBe(false);
  await user.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
  await waitFor(() =>
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'DELETE',
        url: '/api/posts/33333333-3333-4333-8333-333333333333',
      }),
    ),
  );
  expect(await screen.findByText('Draft deleted.')).toBeTruthy();
});

it('copies a draft with its accounts and caption', async () => {
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole('button', { name: /^Duplicate draft:/ }));
  await waitFor(() => expect(requests.some(({ method }) => method === 'POST')).toBe(true));
  const post = requests.find(({ method }) => method === 'POST');
  expect(JSON.parse(post!.body!)).toMatchObject({
    caption: 'Mustard silk scarves are back in stock.',
    targets: [{ channelConnectionId: page.id, captionOverride: null }],
  });
  expect(await screen.findByText('Draft duplicated.')).toBeTruthy();
});

it('shows a failed copy as an error, not as a success', async () => {
  const user = userEvent.setup();
  show({ rejectCopy: true });
  await user.click(await screen.findByRole('button', { name: /^Duplicate draft:/ }));
  expect((await screen.findByRole('alert')).textContent).toBe('Connected account not found');
});

it('hides draft actions from people who can only view', async () => {
  show({ canEdit: false });
  await screen.findByText('Mustard silk scarves are back in stock.');
  expect(screen.queryByRole('button', { name: /^Delete draft:/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Duplicate draft:/ })).toBeNull();
});

it('edits and saves the posting schedule', async () => {
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole('button', { name: 'Posting schedule' }));
  expect(await screen.findByText('2 posting times a week · Dhaka time (GMT+6)')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Remove 8:00 pm on Fri' }));
  await user.click(screen.getByRole('button', { name: 'Add a time on Sat' }));
  await user.type(screen.getByLabelText('New time on Sat'), '12:30{Enter}');
  expect(screen.getByText('12:30 pm')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Save schedule' }));
  await waitFor(() => expect(requests.some(({ method }) => method === 'PUT')).toBe(true));
  expect(JSON.parse(requests.find(({ method }) => method === 'PUT')!.body!)).toEqual({
    channelConnectionId: page.id,
    slots: [
      { weekday: 5, time: '11:00' },
      { weekday: 6, time: '12:30' },
    ],
  });
  expect(await screen.findByText('Posting schedule saved.')).toBeTruthy();
});
