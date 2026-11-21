// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AiFeedbackResponse } from '@dakly/contracts/ai-feedback';
import type { SessionContext } from '@dakly/contracts/sessions';

import { FeedbackTab } from './feedback-tab';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const calls: { path: string; method?: string; body?: string }[] = [];

const feedback: AiFeedbackResponse = {
  summary: {
    helpfulPercent: 33,
    goodCount: 1,
    badCount: 2,
    fixedCount: 1,
    commonProblems: [{ reason: 'missed_the_question', count: 2 }],
  },
  items: [
    {
      messageId: crypto.randomUUID(),
      rating: 'bad',
      reason: 'missed_the_question',
      customerName: 'Habib Rahman',
      customerQuestion: 'Panjabi er kapor ki?',
      replyText: 'Amader panjabi 100% cotton.',
      fixedAt: null,
      ratedAt: '2026-11-19T10:00:00.000Z',
    },
    {
      messageId: crypto.randomUUID(),
      rating: 'bad',
      reason: 'should_have_handed_over',
      customerName: 'Arif Chowdhury',
      customerQuestion: 'Wholesale price koto?',
      replyText: 'দাম ৳2,450।',
      fixedAt: '2026-11-20T10:00:00.000Z',
      ratedAt: '2026-11-19T11:00:00.000Z',
    },
  ],
};

function show(filter: 'needs_fixing' | 'bad' | 'good' | 'all', response = feedback, canFix = true) {
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method, body: init?.body as string | undefined });
    if (init?.method === 'POST') return new Response(null, { status: 204, headers });
    return Response.json(response, { headers });
  });
  const onFilterChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop' },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext);
  render(<FeedbackTab filter={filter} canFix={canFix} onFilterChange={onFilterChange} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return onFilterChange;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  calls.length = 0;
});

// jsdom has no modal dialogs, which the fix form opens in.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('Feedback tab', () => {
  it('shows the helpful percent, the common problems and the rated reply', async () => {
    show('bad');
    expect(await screen.findByText('Habib Rahman')).toBeTruthy();
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.getByText(/Missed the question 2×/)).toBeTruthy();
    expect(screen.getByText('“Panjabi er kapor ki?”')).toBeTruthy();
    expect(screen.getByText('Amader panjabi 100% cotton.')).toBeTruthy();
    expect(calls[0]?.path).toBe('/api/ai-replies/feedback?filter=bad');
  });

  it('asks for another filter when the owner picks one', async () => {
    const onFilterChange = show('bad');
    fireEvent.click(await screen.findByRole('button', { name: 'Good answers' }));
    expect(onFilterChange).toHaveBeenCalledWith('good');
  });

  it('says what to do when nothing is rated yet', async () => {
    show('all', {
      summary: {
        helpfulPercent: null,
        goodCount: 0,
        badCount: 0,
        fixedCount: 0,
        commonProblems: [],
      },
      items: [],
    });
    expect(await screen.findByText(/Nothing is rated yet/)).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
  });

  it('counts fixed replies and marks them Learned without a fix button', async () => {
    show('bad');
    expect(await screen.findByText('Fixed and learned')).toBeTruthy();
    expect(screen.getByText('Learned')).toBeTruthy();
    // Only the reply that is not fixed yet offers the fix.
    expect(screen.getAllByRole('button', { name: 'Write the right answer' })).toHaveLength(1);
  });

  it('sends the corrected answer in Bangla and Banglish as typed', async () => {
    show('needs_fixing');
    fireEvent.click(await screen.findByRole('button', { name: 'Write the right answer' }));
    const question = screen.getByLabelText('When a customer asks') as HTMLInputElement;
    expect(question.value).toBe('Panjabi er kapor ki?');
    fireEvent.change(screen.getByLabelText('Dakly replies'), {
      target: { value: 'আমাদের পাঞ্জাবি ১০০% কটন।' },
    });
    fireEvent.change(screen.getByLabelText(/Also use it for these words/), {
      target: { value: 'kapor, কাপড়' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and teach Dakly' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.path).toMatch(/^\/api\/ai-replies\/[0-9a-f-]+\/fix$/);
    expect(JSON.parse(post?.body ?? '{}')).toEqual({
      question: 'Panjabi er kapor ki?',
      answer: 'আমাদের পাঞ্জাবি ১০০% কটন।',
      keywords: ['kapor', 'কাপড়'],
    });
  });

  it('hides the fix button from people who cannot edit chats', async () => {
    show('bad', feedback, false);
    expect(await screen.findByText('Habib Rahman')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Write the right answer' })).toBeNull();
  });
});
