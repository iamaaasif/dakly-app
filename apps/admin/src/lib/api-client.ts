import { apiFetch, readJson } from '@dakly/ui/api-client';

export async function adminApi<T>(path: string, body?: unknown): Promise<T> {
  return readJson<T>(await apiFetch(`/api/admin/${path}`, { body }));
}

export function adminRequest<T>(path: string, body?: unknown): Promise<T> {
  return adminApi<T>(`auth/${path}`, body);
}
