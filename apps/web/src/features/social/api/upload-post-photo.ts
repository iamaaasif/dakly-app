import { useMutation } from '@tanstack/react-query';

import {
  postPhotoUploadSchema,
  type PostPhotoResponse,
  type PostPhotoUploadResponse,
} from '@dakly/contracts/social';

import { useStoreRequest } from '@/lib/store-request';

export type UploadedPostPhoto = PostPhotoResponse & { contentType: string };

export function useUploadPostPhoto() {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: async (file: File): Promise<UploadedPostPhoto> => {
      const parsed = postPhotoUploadSchema.safeParse({
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!parsed.success) throw new Error('Choose a JPEG, PNG or WebP photo up to 5 MB.');
      const issued = await request<PostPhotoUploadResponse>('/post-media/upload-url', {
        method: 'POST',
        body: parsed.data,
      });
      const uploaded = await fetch(issued.uploadUrl, {
        method: 'PUT',
        body: file,
        credentials: 'omit',
        headers: { 'Content-Type': parsed.data.contentType },
      }).catch(() => undefined);
      if (!uploaded?.ok) throw new Error('The photo could not upload. Try again.');
      const photo = await request<PostPhotoResponse>('/post-media/confirm', {
        method: 'POST',
        body: { ...parsed.data, fileId: issued.fileId },
      });
      return { ...photo, contentType: parsed.data.contentType };
    },
  });
}
