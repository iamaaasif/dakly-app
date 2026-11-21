// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiFeedbackResponse } from '@dakly/contracts/ai-feedback';
import type { SessionContext } from '@dakly/contracts/sessions';

import { FeedbackTab } from './feedback-tab';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const paths: string[] = [];

const feedback: AiFeedbackResponse = {
  summary: {
    helpfulPercent: 33,
    goodCount: 1,
    badCount: 2,
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
      ratedAt: '2026-11-19T10:00:00.000Z',
    },
  ],
};

function show(filter: 'bad' | 'good' | 'all', response = feedback) {
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
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
  render(<FeedbackTab filter={filter} onFilterChange={onFilterChange} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return onFilterChange;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  paths.length = 0;
});

describe('Feedback tab', () => {
  it('shows the helpful percent, the common problems and the rated reply', async () => {
    show('bad');
    expect(await screen.findByText('Habib Rahman')).toBeTruthy();
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.getByText(/Missed the question 2×/)).toBeTruthy();
    expect(screen.getByText('“Panjabi er kapor ki?”')).toBeTruthy();
    expect(screen.getByText('Amader panjabi 100% cotton.')).toBeTruthy();
    expect(paths[0]).toBe('/api/ai-replies/feedback?filter=bad');
  });

  it('asks for another filter when the owner picks one', async () => {
    const onFilterChange = show('bad');
    fireEvent.click(await screen.findByRole('button', { name: 'Good answers' }));
    expect(onFilterChange).toHaveBeenCalledWith('good');
  });

  it('says what to do when nothing is rated yet', async () => {
    show('all', {
      summary: { helpfulPercent: null, goodCount: 0, badCount: 0, commonProblems: [] },
      items: [],
    });
    expect(await screen.findByText(/Nothing is rated yet/)).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
  });
});
