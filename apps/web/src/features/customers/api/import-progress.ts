import { useQuery } from '@tanstack/react-query';

import type { ImportResponse } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

const POLL_MS = 2000;

// Poll while the job runs.
export function useImportProgress(importId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.import(contextTag, importId),
    queryFn: ({ signal }) => request<ImportResponse>(`/imports/${importId}`, { signal }),
    enabled: Boolean(contextTag),
    refetchInterval: ({ state }) => {
      const status = state.data?.status;
      return !status || status === 'importing' ? POLL_MS : false;
    },
  });
}
