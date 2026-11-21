import { useMutation } from '@tanstack/react-query';

import type { ContactExportQuery } from '@dakly/contracts/contacts';
import { ApiError, apiFetch } from '@dakly/ui/api-client';

import { useStoreRequest } from '@/lib/store-request';

// The file is made for the filters on the screen, so the shop gets what it is looking at.
export function useExportCustomers() {
  const { contextTag } = useStoreRequest();
  return useMutation({
    mutationFn: async (query: ContactExportQuery): Promise<number> => {
      if (!contextTag) throw new ApiError('STORE_REQUIRED', 'Choose a shop to continue.');
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
      const response = await apiFetch(`/api/contacts/export?${params.toString()}`, {
        context: { header: 'X-Session-Context', tag: contextTag },
      });
      const name = /filename="([^"]+)"/.exec(
        response.headers.get('content-disposition') ?? '',
      )?.[1];
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = name ?? 'dakly-customers.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
      return Number(response.headers.get('x-row-count'));
    },
  });
}
