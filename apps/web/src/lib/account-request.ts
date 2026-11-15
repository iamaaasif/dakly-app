import { apiRequest, ApiError } from './api-client';
import { useSessionContext } from './session-context';
export function useAccountRequest() {
  const { data } = useSessionContext();
  const contextTag = data?.contextTag;
  return {
    contextTag,
    request: <T>(
      path: string,
      options: { body?: unknown; signal?: AbortSignal; method?: 'GET' | 'POST' | 'DELETE' } = {},
    ) => {
      if (!contextTag) throw new ApiError('AUTH_REQUIRED', 'Sign in to continue.');
      return apiRequest<T>(path, { ...options, contextTag });
    },
  };
}
