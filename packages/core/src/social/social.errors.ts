import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const errors = {
  POST_NOT_FOUND: { status: 404, message: 'Post not found' },
  POST_CONNECTION_NOT_FOUND: { status: 404, message: 'Connected account not found' },
  POST_MEDIA_NOT_FOUND: { status: 404, message: 'Photo not found' },
  POST_DRAFT_REQUIRED: { status: 409, message: 'Only drafts can be changed' },
  POST_PHOTOS_REQUIRED: { status: 400, message: 'Choose photos for this post' },
  POST_CAPTION_TOO_LONG: { status: 400, message: 'Use at most 2,200 characters on Instagram' },
  POST_TOO_MANY_HASHTAGS: { status: 400, message: 'Use at most 30 hashtags on Instagram' },
} as const satisfies ErrorCatalog;

export function socialError(code: keyof typeof errors) {
  return new AppError(code, errors[code]);
}
