import { useQuery } from '@tanstack/react-query';

import type { ImportResponse, ImportStatus } from '@dakly/contracts/contacts';

import { useStoreRequest } from './store-request';

const POLL_MS = 2000;

export function isImportFinished(status: ImportStatus) {
  return status === 'done' || status === 'failed' || status === 'undone';
}

// Poll while the job runs, and while an undo is still removing rows.
export function useImportProgress(
  importId: string,
  source: {
    path: '/imports' | '/product-imports';
    queryKey: (tag: string | undefined) => readonly unknown[];
  },
) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: source.queryKey(contextTag),
    queryFn: ({ signal }) => request<ImportResponse>(`${source.path}/${importId}`, { signal }),
    enabled: Boolean(contextTag),
    refetchInterval: ({ state }) => {
      const current = state.data;
      const undoPending = current?.status === 'undone' && current.undoFinishedAt === null;
      return current && isImportFinished(current.status) && !undoPending ? false : POLL_MS;
    },
  });
}
