// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultAgentAbilities,
  defaultHandoverRules,
  type AgentSettingsResponse,
} from '@dakly/contracts/ai-agent-settings';
import type { TestQuestion } from '@dakly/contracts/ai-practice';
import type { ChannelConnection } from '@dakly/contracts/channels';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { GoLivePanel } from './go-live-panel';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const settings: AgentSettingsResponse = {
  version: 2,
  isAutoReplyOn: true,
  replyLanguage: 'match_customer',
  abilities: defaultAgentAbilities,
  handoverRules: defaultHandoverRules,
  returnToAiMinutes: 60,
  extraRules: null,
  handoverRulesSaved: true,
};
const questions: TestQuestion[] = [
  { question: 'Kurti M size koto?', expectedAnswer: '৳1,850' },
  { question: 'Delivery koto?', expectedAnswer: '৳60 in Dhaka' },
  { question: 'Cotton ki?', expectedAnswer: 'Yes, cotton' },
];
const channel: ChannelConnection = {
  id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e5f',
  kind: 'facebook_page',
  displayName: 'Dhaka Threads',
  externalAccountId: '1',
  status: 'active',
  isAiLive: false,
  tokenExpiresAt: null,
  connectedAt: '2026-11-01T06:00:00.000Z',
  disconnectedAt: null,
};

let live = false;
let goLiveReply: () => Promise<Response>;
const calls: { path: string; method?: string; body?: string }[] = [];

function stubApi() {
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method, body: init?.body as string | undefined });
    if (path.includes('/go-live')) return goLiveReply();
    const bodies = [
      ['channel-connections', { items: [{ ...channel, isAiLive: live }] }],
      ['test-questions', { questions }],
    ] as const;
    const body = bodies.find(([name]) => path.includes(name))?.[1] ?? settings;
    return Response.json(body, { headers });
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
  return render(<GoLivePanel canEdit={canEdit} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  calls.length = 0;
  live = false;
});

const goLiveButton = () => screen.findByRole('button', { name: 'Go live' });

describe('Go live panel', () => {
  it('shows practice mode, the readiness checks and the saved questions', async () => {
    stubApi();
    show();
    expect(await screen.findByText('Practice')).toBeTruthy();
    expect(screen.getByText(/Hand-over rules saved/).textContent).toContain('done');
    expect(screen.getByText(/3 test questions saved/).textContent).toContain('done');
    expect((screen.getAllByLabelText('Customer asks')[1] as HTMLInputElement).value).toBe(
      'Delivery koto?',
    );
  });

  it('keeps the person informed while the long request runs, then shows the channel live', async () => {
    stubApi();
    let finish: (response: Response) => void = () => undefined;
    goLiveReply = () => new Promise((resolve) => (finish = resolve));
    show();
    fireEvent.click(await goLiveButton());
    expect((await screen.findByRole('status')).textContent).toContain('This can take a minute');
    expect((screen.getByRole('button', { name: 'Go live' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    live = true;
    finish(new Response(null, { status: 204, headers }));
    expect(await screen.findByText('Live')).toBeTruthy();
    expect(screen.queryByText(/This can take a minute/)).toBeNull();
  });

  it('marks the question that did not get the expected answer', async () => {
    stubApi();
    goLiveReply = async () =>
      Response.json(
        {
          error: {
            code: 'GO_LIVE_TESTS_FAILED',
            message: 'Some test questions did not get the expected answer',
            fields: [{ path: 'testQuestions.1', message: 'Did not get the expected answer' }],
          },
        },
        { status: 409, headers },
      );
    show();
    fireEvent.click(await goLiveButton());
    expect((await screen.findAllByRole('alert')).map((item) => item.textContent)).toEqual(
      expect.arrayContaining([
        'Some test questions did not get the expected answer',
        'Dakly did not give this answer in the last check.',
      ]),
    );
    expect(screen.getByText('Practice')).toBeTruthy();
  });

  it('looks again instead of retrying when the request is cut off', async () => {
    stubApi();
    goLiveReply = async () => new Response('Bad gateway', { status: 502 });
    show();
    fireEvent.click(await goLiveButton());
    expect((await screen.findByRole('alert')).textContent).toContain('took longer');
    live = true;
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    expect(calls.filter((call) => call.path.includes('/go-live'))).toHaveLength(1);
  });

  it('saves the edited questions', async () => {
    stubApi();
    show();
    fireEvent.change((await screen.findAllByLabelText('Customer asks'))[0]!, {
      target: { value: 'Price koto?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save test questions' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.path).toBe('/api/ai-agent/test-questions');
    expect(JSON.parse(put!.body!).questions[0]).toEqual({
      question: 'Price koto?',
      expectedAnswer: '৳1,850',
    });
  });

  it('offers no Go live button to a person who cannot edit', async () => {
    stubApi();
    show(false);
    await screen.findByText('Practice');
    expect(screen.queryByRole('button', { name: 'Go live' })).toBeNull();
  });
});
