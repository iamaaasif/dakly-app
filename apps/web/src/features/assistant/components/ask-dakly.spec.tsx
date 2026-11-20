// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AskDaklyAnswer } from '@dakly/contracts/assistant';

import { AskDaklyButton } from './ask-dakly-button';
import { sessionContextKey } from '@/lib/session-context';

const navigation = vi.hoisted(() => ({ search: '', replaced: [] as string[] }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: (url: string) => navigation.replaced.push(url) }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const sales: AskDaklyAnswer = {
  kind: 'answer',
  text: 'You sold ৳3,42,800 from 904 orders in the last 30 days.',
  sources: ['Orders, last 30 days'],
  creditsLeft: 24,
};

function serve(reply: (body: unknown) => Response) {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    const response = reply(body);
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
    currentStore: { id: 'shop', ...can },
  });
  render(
    <QueryClientProvider client={client}>
      <AskDaklyButton />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigation.search = 'ask=open';
  navigation.replaced = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Ask Dakly AI panel', () => {
  it('opens from the header button through the URL', async () => {
    navigation.search = '';
    show();
    expect(screen.queryByRole('complementary')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ask Dakly AI' }));
    expect(navigation.replaced).toEqual(['/dashboard?ask=open']);
  });

  it('shows the page it is on, three suggestions and the approval note', () => {
    show();
    const panel = screen.getByRole('complementary', { name: 'Dakly AI' });
    expect(within(panel).getByText('Knows you’re on Dashboard')).toBeTruthy();
    expect(
      within(panel)
        .getAllByRole('button', { name: /last 30 days\?$|performance$/ })
        .map((button) => button.textContent),
    ).toEqual([
      'How much did I sell in the last 30 days?',
      'Explain my campaign performance',
      'How many customers came back in the last 30 days?',
    ]);
    expect(
      within(panel).getByText('Dakly AI suggests. You approve before anything is sent.'),
    ).toBeTruthy();
  });

  it('shows only the suggestions for reports the role can view', () => {
    show({ canViewOrders: true, canViewAnalytics: false, canViewCustomers: false });
    expect(
      screen
        .getAllByRole('button', { name: /last 30 days\?$|performance$/ })
        .map((b) => b.textContent),
    ).toEqual(['How much did I sell in the last 30 days?']);
  });

  it('shows no suggestion block when the role can view no report', () => {
    show({ canViewOrders: false, canViewAnalytics: false, canViewCustomers: false });
    expect(screen.queryByText('Suggested for this page')).toBeNull();
  });

  it('asks a suggestion and shows the answer, its source and the credits left', async () => {
    const bodies = serve(() => Response.json(sales));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Explain my campaign performance' }));
    expect(await screen.findByText(sales.text)).toBeTruthy();
    expect(screen.getByText('From Orders, last 30 days')).toBeTruthy();
    expect(screen.getByText('24 AI credits left')).toBeTruthy();
    expect(bodies).toEqual([{ question: 'Explain my campaign performance', history: [] }]);
  });

  it('sends the earlier turns with a follow-up question', async () => {
    const bodies = serve(() => Response.json(sales));
    show();
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), 'How much did I sell?{Enter}');
    await screen.findByText(sales.text);
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), 'And before that?{Enter}');
    await screen.findAllByText(sales.text);
    expect(bodies[1]).toEqual({
      question: 'And before that?',
      history: [
        { role: 'user', text: 'How much did I sell?' },
        { role: 'assistant', text: sales.text },
      ],
    });
  });

  it('shows a refusal without a source line', async () => {
    serve(() => Response.json({ kind: 'cannot_answer', text: 'I can’t answer that yet.' }));
    show();
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), 'Refund this card{Enter}');
    expect(await screen.findByText('I can’t answer that yet.')).toBeTruthy();
    expect(screen.queryByText(/^From /)).toBeNull();
  });

  it('keeps the typed question when Dakly AI is busy', async () => {
    serve(() =>
      Response.json(
        { error: { code: 'ASK_UNAVAILABLE', message: 'Dakly AI is busy. Try again in a minute.' } },
        { status: 503 },
      ),
    );
    show();
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), 'How much did I sell?{Enter}');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Dakly AI is busy. Try again in a minute.',
    );
    expect((screen.getByLabelText('Ask Dakly AI') as HTMLInputElement).value).toBe(
      'How much did I sell?',
    );
  });

  it('explains when the credits are used up', async () => {
    serve(() =>
      Response.json(
        { error: { code: 'ASK_CREDITS_UNAVAILABLE', message: 'No credits' } },
        { status: 409 },
      ),
    );
    show();
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), 'How much did I sell?{Enter}');
    expect((await screen.findByRole('alert')).textContent).toContain('used all your Ask Dakly AI');
  });

  it('closes with the close button and with Escape', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.type(screen.getByLabelText('Ask Dakly AI'), '{Escape}');
    expect(navigation.replaced).toEqual(['/dashboard', '/dashboard']);
  });
});
