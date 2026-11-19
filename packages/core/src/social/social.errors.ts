import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const errors = {
  POST_NOT_FOUND: { status: 404, message: 'Post not found' },
  POST_CONNECTION_NOT_FOUND: { status: 404, message: 'Connected account not found' },
  POST_APPROVAL_REQUIRED: {
    status: 403,
    message: 'An Owner, Admin or Marketer must approve this caption',
  },
  POST_CONTENT_REQUIRED: { status: 400, message: 'Add a caption, photo or link for this account' },
  POST_TARGET_REQUIRED: { status: 400, message: 'Select an account for this post' },
  POST_TIME_IN_PAST: { status: 400, message: 'Pick a time in the future' },
  POST_NO_SLOTS: { status: 409, message: 'Set a posting slot for this account' },
  POST_SLOT_TAKEN: { status: 409, message: 'An account already has a post at this time' },
  POST_MEDIA_NOT_FOUND: { status: 404, message: 'Photo not found' },
  POST_DRAFT_REQUIRED: { status: 409, message: 'Only drafts can be changed' },
  POST_PHOTOS_REQUIRED: { status: 400, message: 'Choose photos for this post' },
  POST_CAPTION_TOO_LONG: { status: 400, message: 'Use at most 2,200 characters on Instagram' },
  POST_TOO_MANY_HASHTAGS: { status: 400, message: 'Use at most 30 hashtags on Instagram' },
} as const satisfies ErrorCatalog;

export function socialError(code: keyof typeof errors) {
  return new AppError(code, errors[code]);
}
