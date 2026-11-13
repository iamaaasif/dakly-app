import { AppError, type ErrorCatalog } from '../platform/errors/app-error';
const SESSION_ERRORS = {
  STORE_NOT_FOUND: { status: 404, message: 'Store not found' },
} as const satisfies ErrorCatalog;
export const sessionError = (code: keyof typeof SESSION_ERRORS) =>
  new AppError(code, SESSION_ERRORS[code]);
