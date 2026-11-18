import { useQuery } from '@tanstack/react-query';

import type { DeliveryChargeResponse } from '@dakly/contracts/delivery';

import { useStoreRequest } from '@/lib/store-request';

export function useOrderDelivery(areaId?: number) {
  const { contextTag, request } = useStoreRequest();
  return useQuery({
    queryKey: ['order-delivery', contextTag, areaId],
    queryFn: ({ signal }) =>
      request<DeliveryChargeResponse>(`/delivery-zones/charge?areaId=${areaId}`, { signal }),
    enabled: Boolean(contextTag && areaId),
  });
}
