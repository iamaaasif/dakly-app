import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CUSTOMER_PROFILE_ERRORS = {
  // Only a delete between the contact check and the read leaves nothing to show.
  CUSTOMER_PROFILE_NOT_FOUND: { status: 404, message: 'Customer not found' },
} as const satisfies ErrorCatalog;

export function customerProfileError(code: keyof typeof CUSTOMER_PROFILE_ERRORS): AppError {
  return new AppError(code, CUSTOMER_PROFILE_ERRORS[code]);
}
