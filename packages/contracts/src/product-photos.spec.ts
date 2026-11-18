import { describe, expect, it } from 'vitest';

import {
  confirmProductPhotoSchema,
  productPhotoUploadSchema,
  reorderProductPhotosSchema,
} from './products';

describe('product photo contracts', () => {
  it('accepts JPEG, PNG and WebP with a positive size up to five megabytes', () => {
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp'])
      expect(productPhotoUploadSchema.parse({ contentType, sizeBytes: 5 * 1024 * 1024 })).toEqual({
        contentType,
        sizeBytes: 5 * 1024 * 1024,
      });
  });

  it.each([
    { contentType: 'image/svg+xml' },
    { contentType: 'text/plain' },
    { sizeBytes: 0 },
    { sizeBytes: 0.5 },
    { sizeBytes: 5 * 1024 * 1024 + 1 },
    { storeId: 'untrusted' },
  ])('rejects unsupported or untrusted upload input: %j', (change) => {
    expect(
      productPhotoUploadSchema.safeParse({ contentType: 'image/jpeg', sizeBytes: 10, ...change })
        .success,
    ).toBe(false);
  });

  it('requires a file id on confirmation and unique bounded reorder ids', () => {
    const fileId = '019c01ea-cf15-7d31-a7f5-d73d66007ae2';
    expect(
      confirmProductPhotoSchema.parse({ fileId, contentType: 'image/png', sizeBytes: 10 }).fileId,
    ).toBe(fileId);
    expect(reorderProductPhotosSchema.safeParse({ fileIds: [fileId, fileId] }).success).toBe(false);
    expect(reorderProductPhotosSchema.safeParse({ fileIds: Array(11).fill(fileId) }).success).toBe(
      false,
    );
    expect(
      confirmProductPhotoSchema.safeParse({ contentType: 'image/png', sizeBytes: 10 }).success,
    ).toBe(false);
  });
});
