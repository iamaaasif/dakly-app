import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const LINK_ERRORS = {
  // The same answer for a code that never existed and one whose link was deleted.
  LINK_NOT_FOUND: { status: 404, message: 'This link does not work' },
  LINK_RATE_LIMITED: { status: 429, message: 'Too many taps. Try again in a minute' },
  LINK_CODES_EXHAUSTED: { status: 500, message: 'Something went wrong' },
} as const satisfies ErrorCatalog;

export function linkError(code: keyof typeof LINK_ERRORS): AppError {
  return new AppError(code, LINK_ERRORS[code]);
}
