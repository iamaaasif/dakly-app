// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TestAnswerResponse } from '@dakly/contracts/ai-practice';
import type { SessionContext } from '@dakly/contracts/sessions';

import { TestAgentTab } from './test-agent-tab';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const bodies: string[] = [];

function stubAnswer(answer: TestAnswerResponse) {
  vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
    bodies.push(init?.body as string);
    return Response.json(answer, { headers });
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
  return render(<TestAgentTab canEdit={canEdit} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  bodies.length = 0;
});

describe('Test the agent tab', () => {
  it('sends the typed message and shows the reply', async () => {
    stubAnswer({
      kind: 'reply',
      text: 'House 12, Road 5, Dhanmondi.',
      source: { kind: 'answer', question: 'Showroom kothay?' },
    });
    show();
    fireEvent.change(screen.getByLabelText('Customer message'), {
      target: { value: 'Showroom kothay?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('House 12, Road 5, Dhanmondi.')).toBeTruthy();
    expect(screen.getByText('Answered from your answer: “Showroom kothay?”')).toBeTruthy();
    expect(JSON.parse(bodies[0]!)).toEqual({ question: 'Showroom kothay?' });
  });

  it('runs an example question with one click', async () => {
    stubAnswer({ kind: 'reply', text: 'Yes, M is in stock.', source: { kind: 'products' } });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Kurti M size koto?' }));
    await waitFor(() => expect(bodies.length).toBe(1));
    expect(JSON.parse(bodies[0]!)).toEqual({ question: 'Kurti M size koto?' });
    expect(await screen.findByText('Yes, M is in stock.')).toBeTruthy();
    expect(screen.getByText('Answered from Products and stock')).toBeTruthy();
  });

  it('says when the agent would hand over and why', async () => {
    stubAnswer({ kind: 'handover', reason: 'refund' });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Kapor ki cotton?' }));
    expect(
      await screen.findByText(
        '(Dakly stops and calls your team: This is about a refund or exchange.)',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Hand-off rule')).toBeTruthy();
  });

  it('says what Dakly does not know yet when nothing in Knowledge answers', async () => {
    stubAnswer({ kind: 'handover', reason: 'out_of_scope' });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Kapor ki cotton?' }));
    expect(
      await screen.findByText('Dakly doesn’t know this yet, so it calls your team.'),
    ).toBeTruthy();
  });

  it('names the file a reply came from', async () => {
    stubAnswer({
      kind: 'reply',
      text: 'M is chest 38.',
      source: { kind: 'file', fileName: 'Size chart.pdf' },
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Kurti M size koto?' }));
    expect(await screen.findByText('Answered from Size chart.pdf')).toBeTruthy();
  });

  it('does not offer the test to someone who cannot edit settings', () => {
    show(false);
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    expect(screen.getByText(/Only owners and admins/)).toBeTruthy();
  });
});
