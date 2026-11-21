import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CONTACT_MEMORY_ERRORS = {
  CONTACT_NOT_FOUND: { status: 404, message: 'Customer not found' },
  // Thrown so the queue retries with a fresh read; not shown to a person.
  CONTACT_MEMORY_CHANGED: { status: 409, message: 'Customer memory changed while it was updated' },
  CONTACT_MEMORY_UNAVAILABLE: {
    status: 503,
    message: 'Customer memory could not be updated yet',
  },
} as const satisfies ErrorCatalog;

export function contactMemoryError(code: keyof typeof CONTACT_MEMORY_ERRORS) {
  return new AppError(code, CONTACT_MEMORY_ERRORS[code]);
}
