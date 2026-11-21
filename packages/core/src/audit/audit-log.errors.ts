import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AUDIT_LOG_ERRORS = {
  AUDIT_LOG_DENIED: { status: 403, message: 'Only the Owner can see the activity log' },
} as const satisfies ErrorCatalog;
export function auditLogError(code: keyof typeof AUDIT_LOG_ERRORS): AppError {
  return new AppError(code, AUDIT_LOG_ERRORS[code]);
}
