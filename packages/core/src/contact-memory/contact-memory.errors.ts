import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CONTACT_MEMORY_ERRORS = {
  CONTACT_MEMORY_STALE: {
    status: 409,
    message: 'Customer memory changed while it was being updated',
  },
  CONTACT_MEMORY_INVALID: { status: 400, message: 'Customer memory is not valid' },
  CONTACT_MEMORY_MODEL_FAILED: { status: 503, message: 'The memory update could not run' },
} as const satisfies ErrorCatalog;

export function contactMemoryError(code: keyof typeof CONTACT_MEMORY_ERRORS): AppError {
  return new AppError(code, CONTACT_MEMORY_ERRORS[code]);
}
