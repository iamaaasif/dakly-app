import type { ErrorResponse } from '@dakly/contracts/errors';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fields?: ErrorResponse['error']['fields'],
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  context?: { header: string; tag: string };
};

// Resolves only for 2xx responses; anything else becomes an ApiError that keeps the API code.
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const response = await fetch(url, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.context ? { [options.context.header]: options.context.tag } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) throw await readApiError(response);
  return response;
}

export function readJson<T>(response: Response): Promise<T> {
  return response.status === 204
    ? Promise.resolve(undefined as T)
    : (response.json() as Promise<T>);
}

async function readApiError(response: Response): Promise<ApiError> {
  // A proxy 502 or an HTML error page has no JSON body; show the generic message instead.
  const payload = (await response.json().catch(() => undefined)) as ErrorResponse | undefined;
  const error = payload?.error ?? {
    code: 'REQUEST_FAILED',
    message: 'Could not complete the request. Try again.',
  };
  return new ApiError(error.code, error.message, error.fields, response.status);
}
