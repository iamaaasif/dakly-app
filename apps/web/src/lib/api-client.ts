import { apiFetch, ApiError, readJson } from '@dakly/ui/api-client';

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  signal?: AbortSignal;
  contextTag?: string;
  idempotencyKey?: string;
};

export async function apiRequest<TResponse>(
  path: string,
  options: ApiOptions & { body?: unknown } = {},
): Promise<TResponse> {
  const { contextTag, ...request } = options;
  const response = await apiFetch(`/api${path}`, {
    ...request,
    context: contextTag ? { header: 'X-Session-Context', tag: contextTag } : undefined,
  }).catch((error: unknown) => {
    if (contextTag && isContextFailure(error)) notifyContextChanged();
    throw error;
  });
  if (contextTag && response.headers.get('x-session-context') !== contextTag) {
    notifyContextChanged();
    throw new ApiError(
      'SESSION_CONTEXT_CHANGED',
      'Your shop or access changed. Refresh to continue.',
    );
  }
  return readJson<TResponse>(response);
}

export function apiPost<TResponse>(
  path: string,
  body: unknown,
  options?: ApiOptions,
): Promise<TResponse> {
  return apiRequest<TResponse>(path, { ...options, body });
}

function isContextFailure(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.code === 'SESSION_CONTEXT_CHANGED')
  );
}

function notifyContextChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('dakly-context-changed'));
}
