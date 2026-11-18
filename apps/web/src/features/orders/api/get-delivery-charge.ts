import { useQuery } from '@tanstack/react-query';

import type { DeliveryChargeResponse } from '@dakly/contracts/delivery';
import type { OrderDetail } from '@dakly/contracts/orders';

import { useStoreRequest } from '@/lib/store-request';

export function useOrderDelivery(
  areaId?: number,
  order?: Pick<OrderDetail, 'recipientBdAreaId' | 'deliveryChargePoisha'>,
) {
  const { contextTag, request } = useStoreRequest();
  const quoteArea = areaId === order?.recipientBdAreaId ? undefined : areaId;
  const query = useQuery({
    queryKey: ['order-delivery', contextTag, quoteArea],
    queryFn: ({ signal }) =>
      request<DeliveryChargeResponse>(`/delivery-zones/charge?areaId=${quoteArea}`, { signal }),
    enabled: Boolean(contextTag && quoteArea),
  });
  return {
    chargePoisha: quoteArea ? query.data?.chargePoisha : order?.deliveryChargePoisha,
    error: query.error,
  };
}
