import type { ErrorResponse } from '@dakly/contracts/errors';
export async function adminRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as ErrorResponse | undefined;
    throw new Error(payload?.error?.message ?? 'Could not complete the request. Try again.');
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
