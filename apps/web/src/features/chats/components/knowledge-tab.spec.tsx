// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';
import type { SessionContext } from '@dakly/contracts/sessions';

import { KnowledgeTab } from './knowledge-tab';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const calls: { path: string; method?: string; body?: string }[] = [];

function item(overrides: Partial<KnowledgeItemResponse>): KnowledgeItemResponse {
  return {
    id: crypto.randomUUID(),
    kind: 'policy',
    answer: 'Open 10 am to 10 pm.',
    fileId: null,
    status: 'active',
    factsCount: 0,
    failureReason: null,
    createdAt: '2026-11-01T06:00:00.000Z',
    updatedAt: '2026-11-01T06:00:00.000Z',
    ...overrides,
  };
}

function stubApi(items: KnowledgeItemResponse[]) {
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method, body: init?.body as string | undefined });
    if (init?.method === 'POST') return Response.json(item({}), { status: 201, headers });
    if (init?.method === 'DELETE') return new Response(null, { status: 204, headers });
    return Response.json({ items, nextCursor: null }, { headers });
  });
}

function show(canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop' },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext);
  return render(<KnowledgeTab canEdit={canEdit} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('Knowledge tab', () => {
  it('counts answers and files and shows what Dakly learned from a file', async () => {
    stubApi([
      item({ answer: 'Showroom is in Dhanmondi.' }),
      item({ kind: 'file', answer: null, fileId: crypto.randomUUID(), factsCount: 41 }),
    ]);
    show();
    expect(await screen.findByText('1 answer')).toBeTruthy();
    expect(screen.getByText('1 file')).toBeTruthy();
    expect(screen.getByText('Learned 41 facts')).toBeTruthy();
  });

  it('finds answers by their words', async () => {
    stubApi([
      item({ answer: 'Showroom is in Dhanmondi.' }),
      item({ answer: 'We exchange in 7 days.' }),
    ]);
    show();
    fireEvent.change(await screen.findByLabelText('Search answers'), {
      target: { value: 'exchange' },
    });
    expect(screen.queryByText('Showroom is in Dhanmondi.')).toBeNull();
    expect(screen.getByText('We exchange in 7 days.')).toBeTruthy();
  });

  it('adds an answer as a policy item', async () => {
    stubApi([]);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add answer' }));
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'Open 10 to 10.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(JSON.parse(calls.find((call) => call.method === 'POST')!.body!)).toEqual({
      kind: 'policy',
      answer: 'Open 10 to 10.',
    });
  });

  it('hides the edit buttons from someone who can only view', async () => {
    stubApi([item({})]);
    show(false);
    await screen.findByText('1 answer');
    expect(screen.queryByRole('button', { name: 'Add answer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload a file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete answer' })).toBeNull();
  });
});
