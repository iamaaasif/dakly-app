import { apiFetch, ApiError, readJson } from '@dakly/ui/api-client';

export async function supportRequest<T>(
  url: string,
  options: { body?: unknown; contextTag?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const { contextTag, ...rest } = options;
  const response = await apiFetch(url, {
    ...rest,
    context: contextTag ? { header: 'X-Support-Context', tag: contextTag } : undefined,
  }).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'SUPPORT_CONTEXT_CHANGED')
      window.dispatchEvent(new Event('dakly-support-changed'));
    throw error;
  });
  const payload = await readJson<T & { contextTag?: string }>(response);
  if (contextTag && payload.contextTag !== contextTag) {
    window.dispatchEvent(new Event('dakly-support-changed'));
    throw new ApiError(
      'SUPPORT_CONTEXT_CHANGED',
      'Your support access changed. Refresh before continuing.',
    );
  }
  return payload;
}
