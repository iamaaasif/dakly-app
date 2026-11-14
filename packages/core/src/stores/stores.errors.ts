import { AppError, type ErrorCatalog } from '../platform/errors/app-error';
const STORE_ERRORS = {
  STORE_NOT_FOUND: { status: 404, message: 'Store not found' },
} as const satisfies ErrorCatalog;
export function storeError(code: keyof typeof STORE_ERRORS): AppError {
  return new AppError(code, STORE_ERRORS[code]);
}
