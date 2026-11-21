// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CreditsMeter } from './credits-meter';
import { sessionContextKey } from '@/lib/session-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the credits left, a bar and the reset date', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { allowance: 100, remaining: 64, resetsAt: '2026-12-01T04:00:00.000Z' },
      { headers: { 'x-session-context': 'verified' } },
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, { contextTag: 'verified', currentStore: {} });
  render(
    <QueryClientProvider client={client}>
      <CreditsMeter />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('64 AI credits left')).toBeTruthy();
  const bar = screen.getByRole('progressbar', { name: 'AI credits left' });
  expect(bar.getAttribute('aria-valuenow')).toBe('64');
  expect(bar.getAttribute('aria-valuemax')).toBe('100');
  expect(screen.getByText('Resets Dec 1')).toBeTruthy();
});
