import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

// Callers page through contacts in bounded batches (indexes-and-scale.md).
export const MAX_CONSENT_CONTACTS = 100;

const CONSENT_ERRORS = {
  CONSENT_CONTACTS_TOO_MANY: {
    status: 400,
    message: `Read consent for at most ${MAX_CONSENT_CONTACTS} contacts at a time`,
  },
} as const satisfies ErrorCatalog;

export function consentError(code: keyof typeof CONSENT_ERRORS): AppError {
  return new AppError(code, CONSENT_ERRORS[code]);
}
