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

function renderMeter(remaining: number, allowance = 100) {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { allowance, remaining, resetsAt: '2026-12-01T04:00:00.000Z' },
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
}

it('shows the credits left, a bar and the reset date', async () => {
  renderMeter(64);
  expect(await screen.findByText('64 AI credits left')).toBeTruthy();
  const bar = screen.getByRole('progressbar', { name: 'AI credits left' });
  expect(bar.getAttribute('aria-valuenow')).toBe('64');
  expect(bar.getAttribute('aria-valuemax')).toBe('100');
  expect(screen.getByText('Resets Dec 1')).toBeTruthy();
});

it('groups thousands in the count', async () => {
  renderMeter(1200, 2000);
  expect(await screen.findByText('1,200 AI credits left')).toBeTruthy();
});

it('says credit, not credits, for one left', async () => {
  renderMeter(1);
  expect(await screen.findByText('1 AI credit left')).toBeTruthy();
});
