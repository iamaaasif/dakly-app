import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SAVED_REPLY_ERRORS = {
  SAVED_REPLIES_DISABLED: { status: 403, message: 'Enable Chats to open saved replies' },
  SAVED_REPLY_NOT_FOUND: { status: 404, message: 'Saved reply not found' },
  SAVED_REPLY_SHORTCUT_TAKEN: { status: 409, message: 'This shortcut is already in use' },
} as const satisfies ErrorCatalog;

export function savedReplyError(code: keyof typeof SAVED_REPLY_ERRORS) {
  return new AppError(code, SAVED_REPLY_ERRORS[code]);
}
