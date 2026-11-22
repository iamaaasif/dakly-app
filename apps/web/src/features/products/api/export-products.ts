import { useMutation } from '@tanstack/react-query';

import type { ProductExportQuery } from '@dakly/contracts/product-imports';

import { downloadExport } from '@/lib/download-export';
import { useStoreRequest } from '@/lib/store-request';

export function useExportProducts() {
  const { contextTag } = useStoreRequest();
  return useMutation({
    mutationFn: (query: ProductExportQuery) =>
      downloadExport(
        { path: 'products', fallbackName: `dakly-products.${query.format}`, contextTag },
        query,
      ),
  });
}
