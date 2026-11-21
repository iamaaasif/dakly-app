import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const DUE_BOOK_ERRORS = {
  DUE_ENTRY_IN_FUTURE: { status: 400, message: 'The date cannot be in the future' },
  DUE_WRITE_OFF_EXCEEDS_BALANCE: {
    status: 409,
    message: 'You can write off at most what this customer owes',
  },
  DUE_WRITE_OFF_NOT_ALLOWED: {
    status: 403,
    message: 'Only the owner or an admin can write off a debt',
  },
} as const satisfies ErrorCatalog;

export function dueBookError(code: keyof typeof DUE_BOOK_ERRORS): AppError {
  return new AppError(code, DUE_BOOK_ERRORS[code]);
}
