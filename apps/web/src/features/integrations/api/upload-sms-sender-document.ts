import { useMutation } from '@tanstack/react-query';

import {
  smsSenderDocumentUploadSchema,
  type SmsSenderDocumentUploadResponse,
} from '@dakly/contracts/sms-senders';

import { useStoreRequest } from '@/lib/store-request';

// Sends the file straight to storage, then asks the API to confirm it. Returns the file id.
export function useUploadSmsSenderDocument() {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: async (file: File): Promise<string> => {
      const parsed = smsSenderDocumentUploadSchema.safeParse({
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!parsed.success) throw new Error('Choose a PDF, JPEG or PNG file up to 5 MB.');
      const issued = await request<SmsSenderDocumentUploadResponse>(
        '/sms-sender-ids/documents/upload-url',
        { method: 'POST', body: parsed.data },
      );
      const uploaded = await fetch(issued.uploadUrl, {
        method: 'PUT',
        body: file,
        credentials: 'omit',
        headers: { 'Content-Type': parsed.data.contentType },
      }).catch(() => undefined);
      if (!uploaded?.ok) throw new Error('The file could not upload. Try again.');
      await request<{ id: string }>('/sms-sender-ids/documents/confirm', {
        method: 'POST',
        body: { ...parsed.data, fileId: issued.fileId },
      });
      return issued.fileId;
    },
  });
}
