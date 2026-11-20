import { useMutation } from '@tanstack/react-query';

import type { ImportResponse } from '@dakly/contracts/contacts';
import type { StartProductImportInput } from '@dakly/contracts/product-imports';

import { useStoreRequest } from '@/lib/store-request';

export function useStartProductImport(importId: string) {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (input: StartProductImportInput) =>
      request<ImportResponse>(`/product-imports/${importId}/start`, { body: input }),
  });
}
