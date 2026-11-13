import type { ErrorResponse } from '@dakly/contracts/errors';

class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fields?: ErrorResponse['error']['fields'],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiPost<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const { error } = (await response.json()) as ErrorResponse;
    throw new ApiError(error.code, error.message, error.fields);
  }
  return (await response.json()) as TResponse;
}
