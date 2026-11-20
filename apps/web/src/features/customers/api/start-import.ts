import { useMutation } from '@tanstack/react-query';

import type { ImportResponse, StartImportInput } from '@dakly/contracts/contacts';

import { useStoreRequest } from '@/lib/store-request';

export function useStartImport(importId: string) {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (input: StartImportInput) =>
      request<ImportResponse>(`/imports/${importId}/start`, { body: input }),
  });
}
