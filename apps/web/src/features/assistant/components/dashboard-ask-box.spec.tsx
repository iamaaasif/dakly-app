// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { takeHandedOffQuestion } from '../ask-handoff';
import { AskDaklyButton } from './ask-dakly-button';
import { DashboardAskBox } from './dashboard-ask-box';
import { sessionContextKey } from '@/lib/session-context';

const navigation = vi.hoisted(() => ({ search: '', replaced: [] as string[] }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: (url: string) => navigation.replaced.push(url) }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function serve() {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const response = Response.json({
      kind: 'answer',
      text: 'You sold ৳3,42,800 today.',
      sources: ['Orders, today'],
      creditsLeft: 24,
    });
    response.headers.set('x-session-context', 'verified');
    return response;
  });
  return bodies;
}

function show(
  can: Record<string, boolean> = {
    canViewOrders: true,
    canViewAnalytics: true,
    canViewCustomers: true,
  },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { storeId: 'shop-a', ...can },
  });
  render(
    <QueryClientProvider client={client}>
      <AskDaklyButton />
      <DashboardAskBox />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigation.search = '';
  navigation.replaced = [];
});
afterEach(() => {
  cleanup();
  // The panel never mounts in the tests that only check the URL, so nothing took the question.
  takeHandedOffQuestion();
  vi.unstubAllGlobals();
});

describe('Dashboard Ask box', () => {
  it('opens the panel when a question is typed', async () => {
    show();
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), 'Which product sells best?{Enter}');
    expect(navigation.replaced).toEqual(['/dashboard?ask=open']);
  });

  it('sends the typed question in the open panel and clears the box', async () => {
    navigation.search = 'ask=open';
    const bodies = serve();
    show();
    const box = screen.getAllByLabelText('Ask Dakly AI')[1] as HTMLInputElement;
    await userEvent.type(box, 'How much did I sell today?{Enter}');
    await waitFor(() =>
      expect(bodies).toEqual([{ question: 'How much did I sell today?', history: [] }]),
    );
    expect(await screen.findByText('You sold ৳3,42,800 today.')).toBeTruthy();
    expect(box.value).toBe('');
  });

  it('shows the first three suggestions the role may ask, and asks one when tapped', async () => {
    const bodies = serve();
    navigation.search = 'ask=open';
    show({ canViewOrders: true, canViewAnalytics: false, canViewCustomers: false });
    const row = screen.getByText('Try:').parentElement!;
    expect(Array.from(row.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'How much did I sell today?',
      'Which product sells best?',
      'How much did I sell this month?',
    ]);
    await userEvent.click(row.querySelectorAll('button')[1]!);
    await waitFor(() =>
      expect(bodies).toEqual([{ question: 'Which product sells best?', history: [] }]),
    );
  });

  it('shows no suggestions when the role can view no report', () => {
    show({ canViewOrders: false, canViewAnalytics: false, canViewCustomers: false });
    expect(screen.queryByText('Try:')).toBeNull();
  });

  it('ignores an empty question', async () => {
    show();
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), '   {Enter}');
    expect(navigation.replaced).toEqual([]);
  });
});
