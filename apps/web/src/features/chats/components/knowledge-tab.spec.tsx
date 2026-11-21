// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
    question: null,
    answer: 'Open 10 am to 10 pm.',
    keywords: [],
    fileId: null,
    fileName: null,
    sourceUrl: null,
    status: 'active',
    factsCount: 0,
    timesUsed: 0,
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
    if (path.endsWith('/ai-agent/knowledge-summary'))
      return Response.json({ productsCount: 7, storeRulesCount: 3 }, { headers });
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

// jsdom has no modal dialogs, which the answer form opens in.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('Knowledge tab', () => {
  it('counts products, store rules, answers and sources', async () => {
    stubApi([
      item({ answer: 'Showroom is in Dhanmondi.' }),
      item({ kind: 'file', answer: null, fileId: crypto.randomUUID(), factsCount: 41 }),
      item({ kind: 'url', answer: null, sourceUrl: 'https://urbantrend.com.bd', factsCount: 18 }),
    ]);
    show();
    expect(await screen.findByText('1 answer')).toBeTruthy();
    expect(screen.getByText('2 sources')).toBeTruthy();
    expect(await screen.findByText('7 products')).toBeTruthy();
    expect(screen.getByText('3 rules')).toBeTruthy();
    expect(screen.getByText('Learned 41 facts')).toBeTruthy();
  });

  it('shows the question, keywords and how often an answer was used', async () => {
    stubApi([
      item({
        question: 'Where is your showroom?',
        answer: 'House 12, Road 5, Dhanmondi.',
        keywords: ['showroom', 'dokan', 'shop', 'kothay', 'fifth'],
        timesUsed: 41,
      }),
      item({ question: 'Can you gift wrap?', answer: 'Yes, for 50 taka.', timesUsed: 0 }),
    ]);
    show();
    expect(await screen.findByText('Where is your showroom?')).toBeTruthy();
    expect(screen.getByText('House 12, Road 5, Dhanmondi.')).toBeTruthy();
    expect(screen.getByText('kothay')).toBeTruthy();
    // Only four keywords fit on a card.
    expect(screen.queryByText('fifth')).toBeNull();
    expect(screen.getByText('Added by you · Used 41 times')).toBeTruthy();
    expect(screen.getByText('Added by you · Not used yet')).toBeTruthy();
  });

  it('names an uploaded file and a website link', async () => {
    stubApi([
      item({ kind: 'file', answer: null, fileId: crypto.randomUUID(), fileName: 'Size chart.pdf' }),
      item({ kind: 'url', answer: null, sourceUrl: 'https://urbantrend.com.bd/policy' }),
    ]);
    show();
    expect(await screen.findByText('Size chart.pdf')).toBeTruthy();
    expect(screen.getByText('https://urbantrend.com.bd/policy')).toBeTruthy();
  });

  it('finds answers by their words', async () => {
    stubApi([
      item({ answer: 'Showroom is in Dhanmondi.' }),
      item({ answer: 'We take it back.', keywords: ['exchange'] }),
    ]);
    show();
    fireEvent.change(await screen.findByLabelText('Search answers'), {
      target: { value: 'exchange' },
    });
    expect(screen.queryByText('Showroom is in Dhanmondi.')).toBeNull();
    expect(screen.getByText('We take it back.')).toBeTruthy();
  });

  it('adds an answer as a policy item', async () => {
    stubApi([]);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(await screen.findByText('Write what customers ask.')).toBeTruthy();
    expect(screen.getByText('Write how Dakly should answer.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('When a customer asks'), {
      target: { value: 'Showroom kothay?' },
    });
    fireEvent.change(screen.getByLabelText('Dakly replies'), {
      target: { value: 'Open 10 to 10.' },
    });
    fireEvent.change(screen.getByLabelText('Also use it for these words'), {
      target: { value: 'showroom, dokan ,, showroom' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(JSON.parse(calls.find((call) => call.method === 'POST')!.body!)).toEqual({
      kind: 'policy',
      question: 'Showroom kothay?',
      answer: 'Open 10 to 10.',
      keywords: ['showroom', 'dokan'],
    });
  });

  it('asks before deleting a file and deletes only after the owner confirms', async () => {
    stubApi([item({ kind: 'file', answer: null, fileId: crypto.randomUUID(), factsCount: 3 })]);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete file' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));
    // The icon button is replaced by the confirm button of the same name.
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
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
