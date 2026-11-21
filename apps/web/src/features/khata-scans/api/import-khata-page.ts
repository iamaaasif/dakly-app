import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ImportKhataPageInput, KhataImportResponse } from '@dakly/contracts/khata-scans';

import { khataKeys } from './khata-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useImportKhataPage(pageId: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportKhataPageInput) =>
      request<KhataImportResponse>(`/khata-scans/pages/${pageId}/import`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: khataKeys.imports(contextTag) }),
  });
}

export function useUndoKhataImport() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (importId: string) =>
      request<KhataImportResponse>(`/khata-scans/imports/${importId}/undo`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: khataKeys.imports(contextTag) }),
  });
}
