import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { RestockNotificationResponse } from '@dakly/contracts/restock-requests';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

type RestockProductInput = {
  restocks: { variantId: string; quantity: number }[];
  // Sizes whose waiting people the owner agreed to message.
  notifyVariantIds: string[];
};

// Stock is added first, because the approval route refuses a size that is still out of stock.
// The two steps are separate calls, so a failure leaves the stock already saved.
export function useRestockProduct() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: async ({ restocks, notifyVariantIds }: RestockProductInput) => {
      for (const { variantId, quantity } of restocks)
        await request<void>(`/variants/${variantId}/stock-adjustments`, {
          method: 'POST',
          body: { quantity, reason: 'Restock' },
        });
      let queued = 0;
      for (const variantId of notifyVariantIds) {
        const result = await request<RestockNotificationResponse>(
          `/variants/${variantId}/restock-notifications`,
          { method: 'POST' },
        );
        queued += result.queued;
      }
      return { queued };
    },
    onSettled: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
