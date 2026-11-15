import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const errors = {
  STAFF_ACCESS_REQUIRED: { status: 403, message: 'Staff Access verification is required' },
  STAFF_AUTH_REQUIRED: { status: 401, message: 'Sign in to your staff account' },
  STAFF_INVALID_CREDENTIALS: {
    status: 401,
    message: 'The credentials or verification could not be accepted',
  },
  STAFF_RATE_LIMITED: { status: 429, message: 'Too many attempts. Try again later' },
  STAFF_PERMISSION_DENIED: { status: 403, message: 'Your staff role cannot perform this action' },
} satisfies ErrorCatalog;
export const staffError = (code: keyof typeof errors) => new AppError(code, errors[code]);
