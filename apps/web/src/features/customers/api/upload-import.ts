import { useMutation } from '@tanstack/react-query';

import type { ImportUploadResponse } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';

import { useStoreRequest } from '@/lib/store-request';

// The file goes straight to storage; the API only sees its size.
export function useUploadImport() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: async (file: File) => {
      const upload = await request<ImportUploadResponse>('/imports', {
        body: { sizeBytes: file.size },
      });
      const stored = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/csv' },
        body: file,
      }).catch(() => undefined);
      if (!stored?.ok)
        throw new ApiError('IMPORT_UPLOAD_FAILED', 'The file did not upload. Try again.');
      return upload.importId;
    },
  });
}
