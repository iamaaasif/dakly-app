import { ApiError, apiFetch } from '@dakly/ui/api-client';

// Fetches an export the API builds for the screen's filters and hands it to the browser as a
// download. Returns how many rows the file holds.
export async function downloadExport(
  { path, fallbackName, contextTag }: { path: string; fallbackName: string; contextTag?: string },
  query: Record<string, string | undefined>,
): Promise<number> {
  if (!contextTag) throw new ApiError('STORE_REQUIRED', 'Choose a shop to continue.');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const response = await apiFetch(`/api/${path}/export?${params.toString()}`, {
    context: { header: 'X-Session-Context', tag: contextTag },
  });
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1];
  const link = document.createElement('a');
  link.href = URL.createObjectURL(await response.blob());
  link.download = name ?? fallbackName;
  link.click();
  URL.revokeObjectURL(link.href);
  return Number(response.headers.get('x-row-count'));
}
