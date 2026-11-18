// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';

import { createOrderSchema } from '@dakly/contracts/orders';
import { ApiError } from '@dakly/ui/api-client';

import { useCreateOrder } from './create-order';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/store-request', () => ({ useStoreRequest: () => ({ request }) }));

it('lets staff change a draft after a replay proves the order was refused', async () => {
  const input = createOrderSchema.parse({
    buyer: { name: 'Rahim' },
    recipient: {
      name: 'Rahim',
      phone: '01701000014',
      address: 'Mirpur, Dhaka',
      areaId: 301,
    },
    items: [{ variantId: 'e67183e9-ab27-4cf5-a671-7ee21a509efe', quantity: 1 }],
  });
  const outOfStock = new ApiError(
    'STOCK_NOT_AVAILABLE',
    'Not enough available stock',
    undefined,
    409,
  );
  request
    .mockRejectedValueOnce(new TypeError('Connection lost'))
    .mockRejectedValueOnce(outOfStock)
    .mockResolvedValueOnce({ id: 'saved-order' });
  const client = new QueryClient();
  const { result, unmount } = renderHook(useCreateOrder, {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toThrow('Connection lost');
  });
  expect(result.current.mustRetry).toBe(true);
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toBe(outOfStock);
  });
  expect(result.current.mustRetry).toBe(false);
  expect(result.current.error?.message).toBe('Not enough available stock');
  expect(request.mock.calls[1]).toEqual(request.mock.calls[0]);

  await act(async () => {
    await result.current.mutateAsync({ ...input, items: [{ ...input.items[0]!, quantity: 2 }] });
  });
  expect(request.mock.calls[2]?.[1].idempotencyKey).not.toBe(
    request.mock.calls[0]?.[1].idempotencyKey,
  );
  unmount();
  client.clear();
});
