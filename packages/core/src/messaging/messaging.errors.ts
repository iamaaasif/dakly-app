import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const MESSAGING_ERRORS = {
  MESSAGING_CONTACT_HAS_NO_PHONE: { status: 422, message: 'This contact has no phone number' },
  // A provider call inside a store transaction would hold its connection and locks.
  MESSAGING_INSIDE_TRANSACTION: { status: 500, message: 'Something went wrong' },
} as const satisfies ErrorCatalog;

export function messagingError(code: keyof typeof MESSAGING_ERRORS): AppError {
  return new AppError(code, MESSAGING_ERRORS[code]);
}
