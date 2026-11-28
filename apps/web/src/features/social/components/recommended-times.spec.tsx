// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { RecommendedTimes } from './recommended-times';
import { sessionContextKey } from '@/lib/session-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('hands the recommended slots over and says what they are based on', async () => {
  const user = userEvent.setup();
  const used: unknown[] = [];
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { basis: 'orders', slots: [{ weekday: 0, time: '21:00' }] },
      { headers: { 'x-session-context': 'verified' } },
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true },
  });
  render(
    <QueryClientProvider client={client}>
      <RecommendedTimes onUse={(slots) => used.push(slots)} />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Use recommended times' }));
  expect((await screen.findByRole('status')).textContent).toContain('hours your orders come in');
  expect(used).toEqual([[{ weekday: 0, time: '21:00' }]]);
});
