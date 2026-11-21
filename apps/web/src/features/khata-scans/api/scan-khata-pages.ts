import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createKhataPageSchema,
  type KhataPageResponse,
  type KhataPageUploadResponse,
} from '@dakly/contracts/khata-scans';

import { khataKeys } from './khata-keys';
import { useStoreRequest } from '@/lib/store-request';

// One page at a time: ask for an upload link, send the file, then queue the read.
export function useScanKhataPages() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: async (files: File[]): Promise<string[]> => {
      const pageIds: string[] = [];
      for (const file of files) {
        const parsed = createKhataPageSchema.safeParse({
          contentType: file.type,
          sizeBytes: file.size,
        });
        if (!parsed.success) throw new Error('Choose JPG, PNG or PDF pages up to 10 MB each.');
        const issued = await request<KhataPageUploadResponse>('/khata-scans/pages', {
          method: 'POST',
          body: parsed.data,
        });
        const uploaded = await fetch(issued.uploadUrl, {
          method: 'PUT',
          body: file,
          credentials: 'omit',
          headers: { 'Content-Type': parsed.data.contentType },
        }).catch(() => undefined);
        if (!uploaded?.ok) throw new Error('A page could not upload. Try again.');
        const queued = await request<KhataPageResponse>(
          `/khata-scans/pages/${issued.pageId}/read`,
          { method: 'POST' },
        );
        client.setQueryData(khataKeys.page(contextTag, issued.pageId), queued);
        pageIds.push(issued.pageId);
      }
      return pageIds;
    },
  });
}

export function useReadKhataPageAgain(pageId: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<KhataPageResponse>(`/khata-scans/pages/${pageId}/read`, { method: 'POST' }),
    onSuccess: (page) => client.setQueryData(khataKeys.page(contextTag, pageId), page),
  });
}
