// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { it, expect, vi } from 'vitest';

import { useOrderStage } from './change-order-stage';
import { orderDetailKey } from './get-order';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/store-request', () => ({
  useStoreRequest: () => ({ request, contextTag: 'shop-a' }),
}));

it.each([false, true])(
  'keeps disposed order data out of the cache (reopened: %s)',
  async (reopened) => {
    const client = new QueryClient();
    const key = orderDetailKey('shop-a', 'order-id');
    const savedOrder = { id: 'order-id', stage: 'on_hold' };
    const newDetail = { id: 'order-id', stage: 'cancelled' };
    let finish!: () => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(savedOrder);
        }),
    );
    client.setQueryData(key, { id: 'order-id', stage: 'to_confirm' });
    const onSaved = vi.fn();
    const { result, unmount } = renderHook(() => useOrderStage(onSaved), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() =>
      result.current.mutate({ id: 'order-id', body: { to: 'on_hold', reason: 'pre_order' } }),
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    client.removeQueries({ queryKey: key });
    client.getMutationCache().clear();
    if (reopened) client.setQueryData(key, newDetail);
    finish();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(key)).toEqual(reopened ? newDetail : undefined);
    unmount();
    client.clear();
    request.mockClear();
  },
);
