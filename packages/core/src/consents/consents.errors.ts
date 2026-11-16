import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

// Callers page through contacts in bounded batches (indexes-and-scale.md).
export const MAX_CONSENT_CONTACTS = 100;
// Only the send gate's audience check, which reads a campaign audience in pages of 500.
export const MAX_AUDIENCE_CONSENT_CONTACTS = 500;

const CONSENT_ERRORS = {
  CONSENT_CONTACTS_TOO_MANY: {
    status: 400,
    message: 'Read consent for fewer contacts at a time',
  },
  CONSENT_OPT_IN_NEEDS_CUSTOMER: {
    status: 400,
    message: 'A Messenger or Instagram opt-in has to come from the customer',
  },
} as const satisfies ErrorCatalog;

export function consentError(code: keyof typeof CONSENT_ERRORS): AppError {
  return new AppError(code, CONSENT_ERRORS[code]);
}
