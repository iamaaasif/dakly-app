// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ContentPiece } from '@dakly/contracts/content';

import type { ContentStudioView } from '../content-studio-view';
import { LibraryTab } from './library-tab';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const piece = (id: string, kind: ContentPiece['kind'], body: string): ContentPiece => ({
  id,
  kind,
  body,
  language: 'en',
  createdByUserId: null,
  isAiWritten: true,
  aiRunId: null,
  createdAt: '2026-11-04T06:00:00.000Z',
  updatedAt: '2026-11-04T06:00:00.000Z',
});
const pieces = [
  piece('11111111-1111-4111-8111-111111111111', 'facebook_post', 'Winter kurtis are here'),
  piece('22222222-2222-4222-8222-222222222222', 'whatsapp', 'Eid offer on silk scarves'),
  piece('33333333-3333-4333-8333-333333333333', 'product_description', 'Soft cotton kurti'),
];
const requests: { method: string; url: string; body?: unknown }[] = [];

function show(view: Partial<ContentStudioView> = {}, canEdit = true) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({
      method: init.method ?? 'GET',
      url,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const headers = { 'x-session-context': 'verified' };
    if (init.method === 'DELETE') return new Response(null, { status: 204, headers });
    if (init.method === 'PATCH') return Response.json(pieces[0], { headers });
    return Response.json({ items: pieces, nextCursor: null }, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true, canEditSocial: canEdit },
  });
  render(
    <QueryClientProvider client={client}>
      <LibraryTab view={{ tab: 'library', group: 'all', q: '', ...view }} />
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

it('counts each group and lists the saved writing', async () => {
  show();
  const groups = await screen.findByRole('navigation', { name: 'Saved writing groups' });
  expect(groups.textContent).toBe('All 3Social posts 1Messages 1Products 1');
  expect(screen.getAllByRole('article')).toHaveLength(3);
});

it('shows only the chosen group and the pieces that match the search', async () => {
  show({ group: 'social' });
  expect(await screen.findAllByRole('article')).toHaveLength(1);
  cleanup();
  show({ q: 'silk' });
  const [only, ...rest] = await screen.findAllByRole('article');
  expect(rest).toHaveLength(0);
  expect(within(only!).getByText('Eid offer on silk scarves')).toBeTruthy();
});

it('offers Schedule post for social writing only and hides edits without permission', async () => {
  show();
  const cards = await screen.findAllByRole('article');
  expect(
    within(cards[0]!)
      .getByRole('link', { name: /Schedule post/ })
      .getAttribute('href'),
  ).toBe('/social/posts/new?piece=11111111-1111-4111-8111-111111111111');
  expect(within(cards[1]!).queryByRole('link', { name: /Schedule post/ })).toBeNull();
  expect(within(cards[2]!).getByRole('button', { name: 'Copy description' })).toBeTruthy();
  cleanup();
  show({}, false);
  const [card] = await screen.findAllByRole('article');
  expect(within(card!).queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(within(card!).queryByRole('button', { name: /Delete/ })).toBeNull();
});

it('asks before deleting and then deletes', async () => {
  const user = userEvent.setup();
  show();
  const [card] = await screen.findAllByRole('article');
  await user.click(within(card!).getByRole('button', { name: 'Delete Facebook post' }));
  expect(requests.some(({ method }) => method === 'DELETE')).toBe(false);
  await user.click(
    within(screen.getByRole('dialog', { name: 'Delete this writing?' })).getByRole('button', {
      name: 'Delete',
    }),
  );
  await vi.waitFor(() =>
    expect(requests.find(({ method }) => method === 'DELETE')?.url).toContain(
      '/content-pieces/11111111-1111-4111-8111-111111111111',
    ),
  );
});

it('saves an edited text', async () => {
  const user = userEvent.setup();
  show();
  const [card] = await screen.findAllByRole('article');
  await user.click(within(card!).getByRole('button', { name: 'Edit' }));
  await user.type(within(card!).getByLabelText('Edit text'), ' today');
  await user.click(within(card!).getByRole('button', { name: 'Save changes' }));
  await vi.waitFor(() =>
    expect(requests.find(({ method }) => method === 'PATCH')?.body).toEqual({
      body: 'Winter kurtis are here today',
    }),
  );
});
