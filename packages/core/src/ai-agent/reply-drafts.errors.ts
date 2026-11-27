import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const REPLY_DRAFT_ERRORS = {
  REPLY_DRAFT_NOTHING_TO_ANSWER: {
    status: 409,
    message: 'The customer has not written anything to answer yet',
  },
  REPLY_DRAFT_UNSUPPORTED: { status: 409, message: 'AI cannot write replies on this channel yet' },
  REPLY_DRAFT_CREDITS_UNAVAILABLE: { status: 409, message: 'There are not enough AI credits' },
  REPLY_DRAFT_UNAVAILABLE: { status: 503, message: 'AI could not write a reply. Try again.' },
} as const satisfies ErrorCatalog;

export function replyDraftError(code: keyof typeof REPLY_DRAFT_ERRORS) {
  return new AppError(code, REPLY_DRAFT_ERRORS[code]);
}
