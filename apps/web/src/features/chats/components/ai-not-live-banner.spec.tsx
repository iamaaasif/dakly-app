// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultAgentAbilities,
  defaultHandoverRules,
  type AgentSettingsResponse,
} from '@dakly/contracts/ai-agent-settings';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { chatScreenQuerySchema } from '../chat-filters';
import { AiNotLiveBanner } from './ai-not-live-banner';
import { sessionContextKey } from '@/lib/session-context';

const settings: AgentSettingsResponse = {
  version: 2,
  isAutoReplyOn: false,
  replyLanguage: 'match_customer',
  abilities: defaultAgentAbilities,
  handoverRules: defaultHandoverRules,
  returnToAiMinutes: 60,
  extraRules: null,
  handoverRulesSaved: true,
};
const channel = {
  id: 'c1',
  kind: 'facebook_page',
  displayName: 'Page',
  externalAccountId: '1',
  status: 'active',
  isAiLive: false,
  tokenExpiresAt: null,
  connectedAt: '2026-11-01T00:00:00.000Z',
  disconnectedAt: null,
};
const headers = { 'x-session-context': 'verified' };
const puts: string[] = [];

function serve(allowance: number) {
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      puts.push(init.body as string);
      return Response.json({ ...settings, isAutoReplyOn: true }, { headers });
    }
    if (path.includes('/usage'))
      return Response.json(
        { allowance, remaining: allowance, periodEnd: '2026-12-01T00:00:00.000Z' },
        { headers },
      );
    if (path.includes('/channel-connections'))
      return Response.json({ items: [channel] }, { headers });
    return Response.json(settings, { headers });
  });
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canEditStoreSettings: true },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext);
  render(<AiNotLiveBanner query={chatScreenQuerySchema.parse({})} />, {
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
  puts.length = 0;
});

describe('AI not live banner', () => {
  it('says why for a new shop on a plan with no AI conversations, with a fix for each reason', async () => {
    serve(0);
    show();
    expect(await screen.findByText(/Your plan has no AI conversations/)).toBeTruthy();
    expect(screen.getByText(/practice mode/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go live' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on AI auto-reply' }));
    await screen.findByText('AI auto-reply is on.');
    expect(JSON.parse(puts[0]!)).toMatchObject({ version: 2, isAutoReplyOn: true });
  });
});
