import { useQuery } from '@tanstack/react-query';

import type { ImportResponse, ImportStatus } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

const POLL_MS = 2000;

export function isImportFinished(status: ImportStatus) {
  return status === 'done' || status === 'failed' || status === 'undone';
}

// Poll while the job runs, and while an undo is still removing customers.
export function useImportProgress(importId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.import(contextTag, importId),
    queryFn: ({ signal }) => request<ImportResponse>(`/imports/${importId}`, { signal }),
    enabled: Boolean(contextTag),
    refetchInterval: ({ state }) => {
      const current = state.data;
      const undoPending = current?.status === 'undone' && current.undoFinishedAt === null;
      return current && isImportFinished(current.status) && !undoPending ? false : POLL_MS;
    },
  });
}
