import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { validateInstagramPhotos } from './post-content';
import { PostMediaService } from './post-media.service';
import { SocialRepository } from './social.repository';

describe('PostMediaService', () => {
  const fixture = new OwnerIsolationFixture();
  const now = new Date('2026-11-20T06:00:00Z');
  const stored = new Map<string, { contentType: string; sizeBytes: number }>();

  beforeAll(() => fixture.setup());
  afterAll(() => fixture.close());

  const storage = {
    createUploadUrl: (key: string) => `https://storage.test/upload/${key}`,
    createDownloadUrl: (key: string) => `https://storage.test/${key}`,
    getObjectMetadata: async (key: string) => stored.get(key) ?? null,
  } as unknown as FileStorageDriver;
  const repository = () => new SocialRepository(fixture.tenant);
  const service = () => new PostMediaService(repository(), { now: () => now }, storage);

  // The browser uploads straight to storage, so the test puts the object there itself.
  async function upload(storeId: string, contentType = 'image/jpeg', sizeBytes = 2048) {
    const { fileId, uploadUrl } = service().requestUpload(storeId, {
      contentType,
      sizeBytes,
    } as never);
    stored.set(new URL(uploadUrl).pathname.replace('/upload/', ''), { contentType, sizeBytes });
    return { fileId, contentType, sizeBytes };
  }

  const fileRows = (fileId: string) =>
    fixture.connection.pool.query('select store_id, purpose, status from files where id=$1', [
      fileId,
    ]);

  it('asks storage for an upload link under the store and writes no file row yet', async () => {
    const { fileId, uploadUrl } = service().requestUpload(fixture.a, {
      contentType: 'image/jpeg',
      sizeBytes: 2048,
    });

    expect(uploadUrl).toContain(`stores/${fixture.a}/post_media/${fileId}`);
    expect((await fileRows(fileId)).rowCount).toBe(0);
  });

  it('marks the photo ready for the store once the stored object matches', async () => {
    const photo = await upload(fixture.a);

    const confirmed = await service().confirm(fixture.a, fixture.userA, photo);

    expect(confirmed).toEqual({
      id: photo.fileId,
      url: `https://storage.test/stores/${fixture.a}/post_media/${photo.fileId}`,
    });
    expect((await fileRows(photo.fileId)).rows).toEqual([
      { store_id: fixture.a, purpose: 'post_media', status: 'ready' },
    ]);
    expect(await repository().listPostMedia(fixture.a, [photo.fileId], now)).toHaveLength(1);
  });

  it('refuses a photo that is missing from storage or differs from what was announced', async () => {
    const photo = await upload(fixture.a);

    for (const input of [
      { ...photo, fileId: randomUUID() },
      { ...photo, sizeBytes: photo.sizeBytes + 1 },
      { ...photo, contentType: 'image/png' },
    ])
      await expect(service().confirm(fixture.a, fixture.userA, input)).rejects.toMatchObject({
        code: 'POST_MEDIA_UPLOAD_INVALID',
      });
    expect((await fileRows(photo.fileId)).rowCount).toBe(0);
  });

  it('refuses to add the same photo twice', async () => {
    const photo = await upload(fixture.a);
    await service().confirm(fixture.a, fixture.userA, photo);

    await expect(service().confirm(fixture.a, fixture.userA, photo)).rejects.toMatchObject({
      code: 'POST_MEDIA_ALREADY_ADDED',
    });
  });

  it('does not let another store confirm or use a photo uploaded for this one', async () => {
    const photo = await upload(fixture.a);
    await service().confirm(fixture.a, fixture.userA, photo);

    await expect(service().confirm(fixture.b, fixture.userB, photo)).rejects.toMatchObject({
      code: 'POST_MEDIA_UPLOAD_INVALID',
    });
    expect(await repository().listPostMedia(fixture.b, [photo.fileId], now)).toEqual([]);
  });

  it('applies the Instagram JPEG rule to an uploaded photo', async () => {
    const png = await upload(fixture.a, 'image/png');
    const jpeg = await upload(fixture.a, 'image/jpeg');
    await service().confirm(fixture.a, fixture.userA, png);
    await service().confirm(fixture.a, fixture.userA, jpeg);

    const photos = await repository().listPostMedia(fixture.a, [png.fileId, jpeg.fileId], now);

    expect(() => validateInstagramPhotos(photos)).toThrow(
      expect.objectContaining({ code: 'POST_INSTAGRAM_PHOTO_FORMAT' }),
    );
    expect(() =>
      validateInstagramPhotos(photos.filter(({ id }) => id === jpeg.fileId)),
    ).not.toThrow();
  });
});
