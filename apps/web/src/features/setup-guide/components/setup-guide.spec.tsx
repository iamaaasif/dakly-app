// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SetupChecklistResponse } from '@dakly/contracts/setup-checklist';

import { SetupCard } from './setup-card';
import { sessionContextKey } from '@/lib/session-context';

const checklist: SetupChecklistResponse = {
  hidden: false,
  steps: [
    { id: 'add_store_details', done: true },
    { id: 'connect_channel', done: false },
    { id: 'add_products', done: false },
  ],
};

function show(
  steps: { id: string; done: boolean }[],
  permissions = { canChangeExtensions: true, canEditStoreSettings: true, canEditProducts: true },
) {
  const requests: { method: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    requests.push({
      method: init.method ?? 'GET',
      body: init.body && JSON.parse(String(init.body)),
    });
    return Response.json(
      { ...checklist, steps, hidden: init.method === 'PATCH' },
      { headers: { 'x-session-context': 'verified' } },
    );
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { storeId: 'shop-a', ...permissions },
  });
  render(
    <QueryClientProvider client={client}>
      <SetupCard />
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('setup guide', () => {
  it('shows progress and gives the next open step the main button', async () => {
    show(checklist.steps);
    expect(await screen.findByText('1 of 3 done')).toBeTruthy();
    const steps = screen.getByRole('region', { name: 'Get started in 3 steps' });
    expect(within(steps).getByRole('heading', { name: 'Add store details' })).toBeTruthy();
    const connect = within(steps).getByRole('link', { name: 'Connect a channel' });
    expect(connect.className).toContain('bg-action');
    expect(connect.getAttribute('href')).toBe('/integrations');
    expect(
      within(steps).getByRole('link', { name: 'Create your first product' }).getAttribute('href'),
    ).toBe('/products/new');
  });

  it('keeps setup links within the member’s permissions', async () => {
    show(
      checklist.steps.map(({ id }) => ({ id, done: false })),
      { canChangeExtensions: false, canEditStoreSettings: false, canEditProducts: true },
    );
    const steps = await screen.findByRole('region', { name: 'Get started in 3 steps' });
    expect(within(steps).queryByRole('link', { name: 'Add store details' })).toBeNull();
    expect(within(steps).queryByRole('link', { name: 'Connect a channel' })).toBeNull();
    expect(
      within(steps).getByRole('link', { name: 'Create your first product' }).className,
    ).toContain('bg-action');
  });

  it('offers Hide guide once every step is done', async () => {
    const requests = show(checklist.steps.map(({ id }) => ({ id, done: true })));
    expect(await screen.findByText('You’re all set')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hide guide' }));
    await waitFor(() =>
      expect(requests).toContainEqual({ method: 'PATCH', body: { hidden: true } }),
    );
  });
});
