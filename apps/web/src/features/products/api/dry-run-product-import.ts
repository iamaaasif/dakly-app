import { useMutation } from '@tanstack/react-query';

import type {
  ProductImportDryRun,
  StartProductImportInput,
} from '@dakly/contracts/product-imports';

import { useStoreRequest } from '@/lib/store-request';

// Reads the uploaded file with the chosen mapping and says what an import would do.
export function useDryRunProductImport(importId: string) {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (input: StartProductImportInput) =>
      request<ProductImportDryRun>(`/product-imports/${importId}/dry-run`, { body: input }),
  });
}
