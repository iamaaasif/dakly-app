import { socialError } from './social.errors';

export function validateInstagramPost(caption: string, photoCount: number) {
  if (!photoCount) throw socialError('POST_PHOTOS_REQUIRED');
  if (Array.from(caption).length > 2_200) throw socialError('POST_CAPTION_TOO_LONG');
  if ((caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)?.length ?? 0) > 30)
    throw socialError('POST_TOO_MANY_HASHTAGS');
}

export function validateInstagramPhotos(photos: { contentType: string }[]) {
  if (photos.some(({ contentType }) => contentType !== 'image/jpeg'))
    throw socialError('POST_INSTAGRAM_PHOTO_FORMAT');
}
