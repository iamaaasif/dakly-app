import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const COMMENT_ERRORS = {
  CHATS_DISABLED: { status: 403, message: 'Enable Chats to open comments' },
  COMMENT_NOT_FOUND: { status: 404, message: 'Comment not found' },
  COMMENT_ALREADY_REPLIED: { status: 409, message: 'You already replied to this comment' },
  COMMENT_PRIVATE_REPLY_USED: {
    status: 409,
    message: 'Meta allows one private reply for each comment',
  },
  COMMENT_PRIVATE_REPLY_EXPIRED: {
    status: 409,
    message: 'Meta only allows a private reply within 7 days of the comment',
  },
  COMMENT_PRIVATE_REPLY_BLOCKED: {
    status: 409,
    message: 'This customer cannot be messaged',
  },
  COMMENT_UNCONFIRMED: {
    status: 503,
    message: 'Meta did not confirm the action. Check the post before trying again',
  },
  COMMENT_REJECTED: { status: 422, message: 'Meta did not accept this action' },
} as const satisfies ErrorCatalog;

export function commentError(code: keyof typeof COMMENT_ERRORS): AppError {
  return new AppError(code, COMMENT_ERRORS[code]);
}
