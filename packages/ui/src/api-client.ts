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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
  context?: { header: string; tag: string };
};

// Resolves only for 2xx responses; anything else becomes an ApiError that keeps the API code.
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const response = await fetch(url, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
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
  // Proxies can return an error body that does not use the API shape.
  const payload = (await response.json().catch(() => undefined)) as ErrorResponse | undefined;
  const error = payload?.error;
  if (typeof error?.code === 'string' && typeof error.message === 'string')
    return new ApiError(error.code, error.message, error.fields, response.status);
  return new ApiError(
    'REQUEST_FAILED',
    'Could not complete the request. Try again.',
    undefined,
    response.status,
  );
}
