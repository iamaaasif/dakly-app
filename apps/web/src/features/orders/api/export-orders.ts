import { useMutation } from '@tanstack/react-query';

import type { OrderExportQuery } from '@dakly/contracts/orders';

import { downloadExport } from '@/lib/download-export';
import { useStoreRequest } from '@/lib/store-request';

export function useExportOrders() {
  const { contextTag } = useStoreRequest();
  return useMutation({
    mutationFn: (query: OrderExportQuery) =>
      downloadExport(
        { path: 'orders', fallbackName: `dakly-orders.${query.format}`, contextTag },
        query,
      ),
  });
}
