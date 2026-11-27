import { useMutation } from '@tanstack/react-query';

import {
  productPhotoUploadSchema,
  type ConfirmProductPhotoInput,
  type ProductPhotoUploadResponse,
} from '@dakly/contracts/products';

import { useStoreRequest } from '@/lib/store-request';

// The photo goes straight to storage; the reply then names it by the file id the API gave.
export function useUploadChatPhoto(conversationId: string) {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: async (file: File): Promise<ConfirmProductPhotoInput> => {
      const parsed = productPhotoUploadSchema.safeParse({
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!parsed.success) throw new Error('Choose a JPEG, PNG or WebP photo up to 5 MB.');
      const issued = await request<ProductPhotoUploadResponse>(
        `/conversations/${conversationId}/photos/upload-url`,
        { method: 'POST', body: parsed.data },
      );
      const uploaded = await fetch(issued.uploadUrl, {
        method: 'PUT',
        body: file,
        credentials: 'omit',
        headers: { 'Content-Type': parsed.data.contentType },
      }).catch(() => undefined);
      if (!uploaded?.ok) throw new Error('The photo could not upload. Try again.');
      return { ...parsed.data, fileId: issued.fileId };
    },
  });
}
