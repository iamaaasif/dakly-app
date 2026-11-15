import { ApiError } from '@dakly/ui/api-client';

import { apiRequest } from './api-client';
import { useSessionContext } from './session-context';

export function useStoreRequest() {
  const { data } = useSessionContext();
  const contextTag = data?.contextTag;
  return {
    contextTag,
    request: <T>(
      path: string,
      options: {
        body?: unknown;
        signal?: AbortSignal;
        method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      } = {},
    ) => {
      if (!contextTag || !data?.currentStore)
        throw new ApiError('STORE_REQUIRED', 'Choose a shop to continue.');
      return apiRequest<T>(path, { ...options, contextTag });
    },
  };
}
