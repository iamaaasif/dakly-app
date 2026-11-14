import type { ErrorResponse } from '@dakly/contracts/errors';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fields?: ErrorResponse['error']['fields'],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  signal?: AbortSignal;
  contextTag?: string;
};

export async function apiRequest<TResponse>(
  path: string,
  options: ApiOptions & { body?: unknown } = {},
): Promise<TResponse> {
  const response = await fetch(`/api${path}`, {
    method: requestMethod(options),
    headers: {
      'Content-Type': 'application/json',
      ...(options.contextTag ? { 'X-Session-Context': options.contextTag } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) await rejectResponse(response, options.contextTag);
  if (options.contextTag && response.headers.get('x-session-context') !== options.contextTag) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('dakly-context-changed'));
    throw new ApiError(
      'SESSION_CONTEXT_CHANGED',
      'Your shop or access changed. Refresh to continue.',
    );
  }
  return response.status === 204
    ? (undefined as TResponse)
    : (response.json() as Promise<TResponse>);
}

export function apiPost<TResponse>(
  path: string,
  body: unknown,
  options?: ApiOptions,
): Promise<TResponse> {
  return apiRequest<TResponse>(path, { ...options, body });
}

async function rejectResponse(response: Response, contextTag?: string): Promise<never> {
  const payload = (await response.json().catch(() => undefined)) as ErrorResponse | undefined;
  const error = payload?.error ?? {
    code: 'REQUEST_FAILED',
    message: 'Could not complete the request. Try again.',
  };
  if (
    contextTag &&
    (response.status === 401 || response.status === 403 || error.code === 'SESSION_CONTEXT_CHANGED')
  ) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('dakly-context-changed'));
  }
  throw new ApiError(error.code, error.message, error.fields);
}

function requestMethod(options: ApiOptions & { body?: unknown }) {
  return options.method ?? (options.body === undefined ? 'GET' : 'POST');
}
