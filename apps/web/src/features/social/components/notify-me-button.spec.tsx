// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { NotifyMeButton } from './notify-me-button';
import { sessionContextKey } from '@/lib/session-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('asks to be told about TikTok and takes the request back', async () => {
  const user = userEvent.setup();
  let platforms: string[] = [];
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    calls.push(method);
    if (method === 'PUT') platforms = ['tiktok'];
    if (method === 'DELETE') platforms = [];
    return Response.json({ platforms }, { headers: { 'x-session-context': 'verified' } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true },
  });
  render(
    <QueryClientProvider client={client}>
      <NotifyMeButton />
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole('button', { name: 'Notify me' }));
  const asked = await screen.findByRole('button', { name: 'We’ll tell you' });
  expect(asked.getAttribute('aria-pressed')).toBe('true');
  await user.click(asked);
  expect(await screen.findByRole('button', { name: 'Notify me' })).toBeTruthy();
  expect(calls).toEqual(['GET', 'PUT', 'DELETE']);
});
