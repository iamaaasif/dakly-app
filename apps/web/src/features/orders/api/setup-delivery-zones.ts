import { useMutation } from '@tanstack/react-query';

import { useStoreRequest } from '@/lib/store-request';

export function useSetupDeliveryZones(retryQuote: () => void) {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: () => request('/delivery-zones/initialize-defaults', { method: 'POST' }),
    onSettled: retryQuote,
  });
}
