// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { PostResponse } from '@dakly/contracts/social';

import { EditPostScreen } from './edit-post-screen';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const pageId = '11111111-1111-4111-8111-111111111111';
const draft: PostResponse = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'post',
  caption: 'Navy or maroon?',
  mediaFileIds: [],
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
      id: 'target',
      channelConnectionId: pageId,
      captionOverride: null,
      status: 'draft',
      scheduledFor: null,
      publishedAt: null,
      externalPostId: null,
      permalink: null,
      errorCode: null,
      errorMessage: null,
      reach: null,
      reactions: null,
      comments: null,
      linkTaps: null,
    },
  ],
};
const account = {
  id: pageId,
  kind: 'facebook_page',
  displayName: 'Urban Trend',
  externalAccountId: '1001',
  status: 'active',
  tokenExpiresAt: null,
  connectedAt: '2026-11-01T06:00:00.000Z',
  disconnectedAt: null,
  isAiLive: false,
};
const requests: { method: string; url: string; body?: unknown }[] = [];

function show() {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const headers = { 'x-session-context': 'verified' };
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    requests.push({ method: init.method ?? 'GET', url, body });
    if (url.includes('/channel-connections'))
      return Response.json({ items: [account], nextCursor: null }, { headers });
    if (url.includes('/queue-slots'))
      return Response.json({ items: [], nextCursor: null }, { headers });
    return Response.json(draft, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true, canEditSocial: true },
  });
  render(
    <QueryClientProvider client={client}>
      <EditPostScreen postId={draft.id} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requests.length = 0;
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('opens the saved draft, saves the changed caption to the same draft and returns to Draft', async () => {
  const user = userEvent.setup();
  show();
  const caption = (await screen.findByDisplayValue('Navy or maroon?')) as HTMLTextAreaElement;
  await user.clear(caption);
  await user.type(caption, 'Navy, maroon or olive?');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/social/posts?tab=draft'));
  const patch = requests.find(({ method }) => method === 'PATCH');
  expect(patch?.url).toContain(`/posts/${draft.id}`);
  expect(patch?.body).toMatchObject({
    caption: 'Navy, maroon or olive?',
    targets: [{ channelConnectionId: pageId, captionOverride: null }],
  });
  expect(requests.some(({ method }) => method === 'POST')).toBe(false);
});
