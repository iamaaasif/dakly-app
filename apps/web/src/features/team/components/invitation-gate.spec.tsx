// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvitationGate } from './invitation-gate';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});
describe('Invitation entry', () => {
  it('scrubs the notice, keeps it through authentication and accepts only on an explicit click', async () => {
    let signedIn = false;
    const requests: { path: string; body?: string }[] = [];
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage() {}
        close() {}
      },
    );
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      requests.push({ path, body: init.body as string | undefined });
      if (path === '/api/invites/accept')
        return Response.json(
          { storeId: 'shop', membershipId: 'member' },
          { headers: { 'x-session-context': 'verified' } },
        );
      return signedIn
        ? Response.json({
            user: { id: 'recipient', name: 'Rina' },
            hasMemberships: false,
            currentStore: null,
            contextTag: 'verified',
          })
        : Response.json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in' } }, { status: 401 });
    });
    history.replaceState(null, '', `/invites/accept#token=${'a'.repeat(64)}`);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <InvitationGate
          renderAuth={(done) => (
            <button
              onClick={() => {
                signedIn = true;
                done();
              }}
            >
              Authenticate recipient
            </button>
          )}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: 'Authenticate recipient' });
    expect(location.hash).toBe('');
    expect(requests.every((request) => !request.body)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Authenticate recipient' }));
    await screen.findByRole('button', { name: 'Accept invitation' });
    expect(requests.some((request) => request.path === '/api/invites/accept')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByText('Invitation accepted.');
    expect(requests.find((request) => request.path === '/api/invites/accept')?.body).toBe(
      JSON.stringify({ token: 'a'.repeat(64) }),
    );
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(history.state).toBeNull();
    location.hash = `token=${'d'.repeat(64)}`;
    await screen.findByRole('button', { name: 'Accept invitation' });
    expect(location.hash).toBe('');
  });
  it('replaces the in-memory notice on same-page navigation and rejects malformed fragments', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        user: { id: 'recipient', name: 'Rina' },
        hasMemberships: false,
        currentStore: null,
        contextTag: 'verified',
      }),
    );
    history.replaceState(null, '', `/invites/accept#token=${'b'.repeat(64)}`);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <InvitationGate renderAuth={() => null} />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: 'Accept invitation' });
    location.hash = `token=${'c'.repeat(64)}&extra=1`;
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull(),
    );
    expect(location.hash).toBe('');
    expect(screen.getByRole('alert').textContent).toContain('invalid');
  });
});
