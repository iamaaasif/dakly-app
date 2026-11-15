import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SESSION_ERRORS = {
  SESSION_CONTEXT_CHANGED: {
    status: 409,
    message: 'Your shop or access changed. Refresh to continue.',
  },
  STORE_NOT_FOUND: { status: 404, message: 'Store not found' },
} as const satisfies ErrorCatalog;
export const sessionError = (code: keyof typeof SESSION_ERRORS) =>
  new AppError(code, SESSION_ERRORS[code]);
