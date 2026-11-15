import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { SupportCustomerResponse } from '@dakly/contracts/support';

import { supportKeys } from './support-keys';
import { supportRequest } from './support-request';

export function useSupportCustomer(id: string, contextTag: string) {
  const client = useQueryClient();
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: supportKeys.customers(contextTag) });
      client.removeQueries({ queryKey: supportKeys.customers(contextTag) });
    },
    [client, contextTag],
  );

  return useQuery({
    queryKey: supportKeys.customer(contextTag, id),
    queryFn: ({ signal }) =>
      supportRequest<SupportCustomerResponse>(`/support/api/customers/${id}`, {
        contextTag,
        signal,
      }),
    enabled: Boolean(id),
    retry: false,
  });
}
