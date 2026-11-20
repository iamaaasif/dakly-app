import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ImportResponse } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useUndoImport(importId: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<ImportResponse>(`/imports/${importId}/undo`, { method: 'POST' }),
    onSuccess: (state) => client.setQueryData(customersKeys.import(contextTag, importId), state),
  });
}
