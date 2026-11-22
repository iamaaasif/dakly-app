import { useMutation } from '@tanstack/react-query';

import type { ContactExportQuery } from '@dakly/contracts/contacts';

import { downloadExport } from '@/lib/download-export';
import { useStoreRequest } from '@/lib/store-request';

// The file is made for the filters on the screen, so the shop gets what it is looking at.
export function useExportCustomers() {
  const { contextTag } = useStoreRequest();
  return useMutation({
    mutationFn: (query: ContactExportQuery) =>
      downloadExport({ path: 'contacts', fallbackName: 'dakly-customers.xlsx', contextTag }, query),
  });
}
