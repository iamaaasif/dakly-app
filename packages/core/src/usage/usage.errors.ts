import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const USAGE_ERRORS = {
  USAGE_ALLOWANCE_EXCEEDED: {
    status: 409,
    message: 'Your plan allowance for this period is used up',
  },
} as const satisfies ErrorCatalog;

export function usageError(code: keyof typeof USAGE_ERRORS): AppError {
  return new AppError(code, USAGE_ERRORS[code]);
}
