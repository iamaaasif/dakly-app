import { useQuery } from '@tanstack/react-query';

import type { KhataImportResponse } from '@dakly/contracts/khata-scans';

import { khataKeys } from './khata-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useKhataImports() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: khataKeys.imports(contextTag),
    queryFn: ({ signal }) => request<KhataImportResponse[]>('/khata-scans/imports', { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
