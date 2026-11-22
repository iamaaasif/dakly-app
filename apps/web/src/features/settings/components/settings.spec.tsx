// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { SettingsScreen } from './settings-screen';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

const store = {
  id: 'shop',
  name: 'Books',
  slug: null,
  extensions: ['sales'],
  legalName: 'Books Ltd',
  businessType: 'Books',
  phone: null,
  email: null,
  address: null,
  district: 'Dhaka',
  vatBin: null,
  tradeLicenceNumber: null,
};
function show(tab: 'store') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewStoreSettings: true, canEditStoreSettings: true },
  });
  render(
    <QueryClientProvider client={client}>
      <SettingsScreen tab={tab} />
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('sends only changed fields, clears nullable values and retains a draft on ordinary refetch', async () => {
  let unavailable = false;
  const writes: unknown[] = [];
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      postMessage() {}
      close() {}
    },
  );
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    expect(init.headers).toMatchObject({ 'X-Session-Context': 'verified' });
    if (unavailable)
      return Response.json(
        { error: { code: 'UNAVAILABLE', message: 'Could not refresh settings' } },
        { status: 503 },
      );
    if (init.method === 'PATCH') writes.push(JSON.parse(String(init.body)));
    return Response.json(store, { headers: { 'x-session-context': 'verified' } });
  });
  const client = show('store');
  const user = userEvent.setup();
  const field = await screen.findByLabelText('Legal name');
  await user.clear(field);
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['store-settings'] });
  });
  expect(screen.getByLabelText('Legal name')).toBe(field);
  expect(field).toHaveProperty('value', '');
  unavailable = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['store-settings'] });
  });
  await screen.findByText('Could not refresh settings');
  expect(screen.getByLabelText('Legal name')).toBe(field);
  expect(field).toHaveProperty('value', '');
  unavailable = false;
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByText('Could not refresh settings')).toBeNull());
  await user.click(screen.getByRole('button', { name: 'Save store information' }));
  await waitFor(() => expect(writes).toEqual([{ legalName: null }]));
});
