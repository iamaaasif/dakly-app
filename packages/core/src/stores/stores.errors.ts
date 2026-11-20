import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const STORE_ERRORS = {
  STORE_EXTENSIONS_DENIED: {
    status: 403,
    message: 'Only the Owner or an Admin can change extensions',
  },
  STORE_APPROVAL_SETTING_DENIED: {
    status: 403,
    message: 'Only the Owner or an Admin can change who approves sends',
  },
  STORE_ATTRIBUTION_SETTING_DENIED: {
    status: 403,
    message: 'Only the Owner can change the attribution window',
  },
  STORE_NOT_FOUND: { status: 404, message: 'Store not found' },
} as const satisfies ErrorCatalog;
export function storeError(code: keyof typeof STORE_ERRORS): AppError {
  return new AppError(code, STORE_ERRORS[code]);
}
