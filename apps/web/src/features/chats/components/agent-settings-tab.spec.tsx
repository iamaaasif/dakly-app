// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultAgentAbilities,
  defaultHandoverRules,
  type AgentSettingsResponse,
} from '@dakly/contracts/ai-agent-settings';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { aiAgentKeys } from '../api/ai-agent-keys';
import { AgentSettingsTab } from './agent-settings-tab';
import { sessionContextKey } from '@/lib/session-context';

const saved: AgentSettingsResponse = {
  version: 3,
  isAutoReplyOn: true,
  replyLanguage: 'match_customer',
  abilities: defaultAgentAbilities,
  handoverRules: defaultHandoverRules,
  returnToAiMinutes: 60,
  extraRules: null,
  handoverRulesSaved: true,
};
const headers = { 'x-session-context': 'verified' };
const requests: { path: string; method?: string; body?: string }[] = [];

function respond(puts: () => Response) {
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    requests.push({ path, method: init?.method, body: init?.body as string | undefined });
    return init?.method === 'PUT' ? puts() : Response.json(saved, { headers });
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
  const view = render(<AgentSettingsTab canEdit={canEdit} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  });
  return { ...view, client };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  requests.length = 0;
});

describe('AI agent settings tab', () => {
  it('keeps unsaved edits when the saved version moves because test questions changed', async () => {
    respond(() => Response.json(saved, { headers }));
    const { client } = show();
    fireEvent.click(await screen.findByRole('switch', { name: /Take orders/ }));
    act(() => {
      client.setQueryData(aiAgentKeys.settings('verified'), { ...saved, version: 4 });
    });
    await waitFor(() => expect(screen.getByRole('switch', { name: /Take orders/ })).toBeTruthy());
    expect(screen.getByRole('switch', { name: /Take orders/ }).getAttribute('aria-checked')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(requests.some((request) => request.method === 'PUT')).toBe(true));
    expect(JSON.parse(requests.find((request) => request.method === 'PUT')!.body!).version).toBe(4);
  });

  it('shows the saved switches and keeps Save off until something changes', async () => {
    respond(() => Response.json(saved, { headers }));
    show();
    const takeOrders = await screen.findByRole('switch', { name: /Take orders/ });
    expect(takeOrders.getAttribute('aria-checked')).toBe('true');
    expect(
      (screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('saves the changed switch together with the version that was loaded', async () => {
    respond(() => Response.json({ ...saved, version: 4 }, { headers }));
    show();
    fireEvent.click(await screen.findByRole('switch', { name: /Take orders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('AI agent settings saved.')).toBeTruthy();
    const put = requests.find((request) => request.method === 'PUT');
    expect(JSON.parse(put!.body!)).toMatchObject({
      version: 3,
      abilities: { takeOrders: false, answerQuestions: true },
    });
  });

  it('says the settings changed and offers the latest when the save is stale', async () => {
    respond(() =>
      Response.json(
        { error: { code: 'AI_AGENT_SETTINGS_CHANGED', message: 'The AI agent settings changed' } },
        { status: 409, headers },
      ),
    );
    show();
    fireEvent.click(await screen.findByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toContain('your edits were not saved');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Load latest settings' })).toBeTruthy(),
    );
  });

  it('shows no Save button to a person who cannot edit', async () => {
    respond(() => Response.json(saved, { headers }));
    show(false);
    expect(await screen.findByText('You can view these settings.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    const switches = screen.getAllByRole('switch') as HTMLButtonElement[];
    expect(switches.length).toBeGreaterThan(0);
    expect(switches.every((toggle) => toggle.disabled)).toBe(true);
  });
});
