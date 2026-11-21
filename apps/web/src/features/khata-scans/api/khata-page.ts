import { useQueries } from '@tanstack/react-query';

import type { KhataPageResponse } from '@dakly/contracts/khata-scans';

import { khataKeys } from './khata-keys';
import { useStoreRequest } from '@/lib/store-request';

const POLL_MS = 1500;

// The read runs in a job, so a page is asked again until it leaves `uploaded` and `reading`.
export function useKhataPages(pageIds: string[]) {
  const { request, contextTag } = useStoreRequest();
  return useQueries({
    queries: pageIds.map((pageId) => ({
      queryKey: khataKeys.page(contextTag, pageId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        request<KhataPageResponse>(`/khata-scans/pages/${pageId}`, { signal }),
      refetchInterval: (query: { state: { data: KhataPageResponse | undefined } }) =>
        query.state.data?.status === 'uploaded' || query.state.data?.status === 'reading'
          ? POLL_MS
          : false,
      enabled: Boolean(contextTag),
      retry: false,
    })),
  });
}
