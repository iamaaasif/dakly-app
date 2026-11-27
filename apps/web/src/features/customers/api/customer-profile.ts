import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CustomerActivityResponse,
  CustomerCampaignResponse,
  CustomerNoteResponse,
  CustomerOrderResponse,
  CustomerPage,
  CustomerSummaryResponse,
  MarketingPreferenceResponse,
} from '@dakly/contracts/customer-profile';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCustomerSummary(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.profile(contextTag, contactId, 'summary'),
    queryFn: ({ signal }) =>
      request<CustomerSummaryResponse>(`/contacts/${contactId}/summary`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}

function usePagedPart<Item>(contactId: string, part: 'orders' | 'activity' | 'campaigns') {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: customersKeys.profile(contextTag, contactId, part),
    enabled: Boolean(contextTag),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: CustomerPage<Item>) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam, signal }) =>
      request<CustomerPage<Item>>(
        `/contacts/${contactId}/${part}?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
  });
}

export const useCustomerOrders = (contactId: string) =>
  usePagedPart<CustomerOrderResponse>(contactId, 'orders');
export const useCustomerActivity = (contactId: string) =>
  usePagedPart<CustomerActivityResponse>(contactId, 'activity');
export const useCustomerCampaigns = (contactId: string) =>
  usePagedPart<CustomerCampaignResponse>(contactId, 'campaigns');

export function useCustomerNotes(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.profile(contextTag, contactId, 'notes'),
    queryFn: ({ signal }) =>
      request<CustomerNoteResponse[]>(`/contacts/${contactId}/notes`, { signal }),
    enabled: Boolean(contextTag),
  });
}

export function useAddCustomerNote(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      request<CustomerNoteResponse>(`/contacts/${contactId}/notes`, { body: { body } }),
    onSuccess: (note) => {
      client.setQueryData<CustomerNoteResponse[]>(
        customersKeys.profile(contextTag, contactId, 'notes'),
        (notes) => [note, ...(notes ?? [])],
      );
      // The note is also a line on the timeline.
      return client.invalidateQueries({
        queryKey: customersKeys.profile(contextTag, contactId, 'activity'),
      });
    },
  });
}

export function useMarketingPreferences(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.profile(contextTag, contactId, 'marketing'),
    queryFn: ({ signal }) =>
      request<MarketingPreferenceResponse[]>(`/contacts/${contactId}/marketing-preferences`, {
        signal,
      }),
    enabled: Boolean(contextTag),
  });
}

export function useSwitchMarketing(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  const key = customersKeys.profile(contextTag, contactId, 'marketing');
  return useMutation({
    mutationFn: (change: { channel: 'whatsapp' | 'sms'; subscribed: boolean }) =>
      request<MarketingPreferenceResponse[]>(
        `/contacts/${contactId}/marketing-preferences/${change.channel}`,
        { method: 'PUT', body: { subscribed: change.subscribed } },
      ),
    // The switch moves at once and goes back if the server refuses.
    onMutate: async (change) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<MarketingPreferenceResponse[]>(key);
      client.setQueryData<MarketingPreferenceResponse[]>(key, (rows) =>
        rows?.map((row) =>
          row.channel === change.channel
            ? { ...row, status: change.subscribed ? 'granted' : 'withdrawn' }
            : row,
        ),
      );
      return { before };
    },
    onError: (_error, _change, context) => client.setQueryData(key, context?.before),
    onSuccess: (rows) => {
      client.setQueryData(key, rows);
      return client.invalidateQueries({
        queryKey: customersKeys.profile(contextTag, contactId, 'activity'),
      });
    },
  });
}
