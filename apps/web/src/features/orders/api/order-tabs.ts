import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type {
  OrderInquiryPage,
  OrderInquiryQuery,
  OrderTabCounts,
} from '@dakly/contracts/order-inquiries';

import { ordersKey } from '@/lib/order-entry/orders-key';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderTabCounts() {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...ordersKey, contextTag, 'tab-counts'],
    queryFn: ({ signal }) => request<OrderTabCounts>('/orders/tab-counts', { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewOrders),
    placeholderData: keepPreviousData,
  });
}

export function useOrderInquiries(query: OrderInquiryQuery) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return useQuery({
    queryKey: [...ordersKey, contextTag, 'inquiries', query],
    queryFn: ({ signal }) =>
      request<OrderInquiryPage>(`/orders/inquiries?${params.toString()}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewOrders),
    placeholderData: keepPreviousData,
  });
}
