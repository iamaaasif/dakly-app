import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { KhataImportResponse } from '@dakly/contracts/khata-scans';

import { khataKeys } from './khata-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useUndoKhataImport() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (importId: string) =>
      request<KhataImportResponse>(`/khata-scans/imports/${importId}/undo`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: khataKeys.imports(contextTag) }),
  });
}
