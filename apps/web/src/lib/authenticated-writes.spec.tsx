// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useCreateStore } from '@/features/auth/api/create-store';
import { useAcceptInvite } from '@/features/team/api/accept-invite';
import { sessionContextKey } from './session-context';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('tags authenticated setup and invitation writes even without a selected shop', async () => {
  const requests: { path: string; tag: string | null }[] = [];
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      postMessage() {}
      close() {}
    },
  );
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    requests.push({ path, tag: new Headers(init.headers).get('x-session-context') });
    return Response.json(
      { id: 'shop', storeId: 'shop' },
      { headers: { 'x-session-context': 'account-only' } },
    );
  });
  const client = new QueryClient();
  client.setQueryData(sessionContextKey, { contextTag: 'account-only', currentStore: null });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const setup = renderHook(() => useCreateStore(), { wrapper });
  const invite = renderHook(() => useAcceptInvite(), { wrapper });
  await act(async () => {
    await setup.result.current.mutateAsync({
      name: 'Books',
      businessType: 'Books',
      district: 'Dhaka',
      howYouSell: ['online_store'],
      customerListSize: 'under_500',
      planCode: 'free',
      billingCycle: 'monthly',
    });
    await invite.result.current.mutateAsync({ token: 'a'.repeat(64) });
  });
  expect(requests).toEqual([
    { path: '/api/stores', tag: 'account-only' },
    { path: '/api/invites/accept', tag: 'account-only' },
  ]);
});
