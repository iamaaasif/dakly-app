import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  productPhotoUploadSchema,
  type ProductPhotoUploadResponse,
  type ProductResponse,
} from '@dakly/contracts/products';

import { productPhotosPath } from './product-photos-path';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useUploadProductPhoto(productId: string, variantId?: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  const path = productPhotosPath(productId, variantId);
  return useMutation({
    gcTime: 0,
    mutationFn: (file: File) => uploadProductPhotoFile(request, path, file),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}

type StoreRequest = ReturnType<typeof useStoreRequest>['request'];

export async function uploadProductPhotoFile<Saved = ProductResponse>(
  request: StoreRequest,
  path: string,
  file: File,
) {
  const parsed = productPhotoUploadSchema.safeParse({
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!parsed.success) throw new Error('Choose a JPEG, PNG or WebP photo up to 5 MB.');
  const issued = await request<ProductPhotoUploadResponse>(`${path}/upload-url`, {
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
  return request<Saved>(`${path}/confirm`, {
    method: 'POST',
    body: { ...parsed.data, fileId: issued.fileId },
  });
}
