import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AUTH_ERRORS = {
  AUTH_CONTACT_TAKEN: {
    status: 409,
    message: 'The replacement contact belongs to another account',
  },
  AUTH_RECOVERY_OWNER_LIMIT: {
    status: 409,
    message: 'Self-service recovery supports up to 1000 store owners',
  },
  AUTH_RECOVERY_CONTACT_REQUIRED: {
    status: 409,
    message: 'A store owner needs a verified contact before recovery can start',
  },
  AUTH_TOTP_INVALID: {
    status: 400,
    message: 'The second-factor verification is incorrect, expired or already used',
  },
  AUTH_TOTP_ENABLED: { status: 409, message: 'Two-step verification is already enabled' },
  AUTH_RECOVERY_PENDING: {
    status: 409,
    message: 'Recovery is waiting for notifications and the seven-day cancellation period',
  },
  AUTH_GOOGLE_UNAVAILABLE: {
    status: 503,
    message: 'Google sign-in is unavailable. Try again later',
  },
  AUTH_TERMS_REQUIRED: {
    status: 400,
    message: 'Agree to the Terms and Privacy documents to create an account',
  },
  AUTH_GOOGLE_CONFLICT: { status: 409, message: 'This Google identity cannot be linked' },
  AUTH_GOOGLE_TICKET_INVALID: {
    status: 400,
    message: 'The Google verification has expired or was already used',
  },
  AUTH_FACEBOOK_UNAVAILABLE: {
    status: 503,
    message: 'Facebook sign-in is unavailable. Try again later',
  },
  AUTH_FACEBOOK_CONFLICT: { status: 409, message: 'This Facebook identity cannot be linked' },
  AUTH_FACEBOOK_EMAIL_REQUIRED: {
    status: 400,
    message: 'Facebook did not share an email address. Sign up with your mobile number instead',
  },
  AUTH_FACEBOOK_STATE_INVALID: {
    status: 400,
    message: 'The Facebook sign-in expired or was opened in another browser. Start again',
  },
  AUTH_INVALID_CREDENTIALS: { status: 401, message: 'The sign-in credentials are incorrect' },
  AUTH_EMAIL_UNVERIFIED: { status: 403, message: 'Verify this email before signing in' },
  AUTH_ACCOUNT_EXISTS: { status: 409, message: 'This account already exists. Sign in instead' },
  AUTH_ACCOUNT_NOT_FOUND: { status: 404, message: 'No account has this verified sign-in method' },
  AUTH_CODE_INVALID: { status: 400, message: 'The code is incorrect or expired' },
  AUTH_RATE_LIMITED: { status: 429, message: 'Too many attempts. Try again later' },
  AUTH_LOCKED: { status: 429, message: 'Sign-in is locked for 15 minutes' },
  AUTH_DISABLED: { status: 403, message: 'This account is disabled' },
  AUTH_SECOND_FACTOR_REQUIRED: { status: 403, message: 'A second factor is required to sign in' },
  AUTH_PROOF_REQUIRED: { status: 403, message: 'Verify an existing sign-in method again' },
  AUTH_EMAIL_TAKEN: { status: 409, message: 'This email belongs to another account' },
  AUTH_EMAIL_UNAVAILABLE: {
    status: 503,
    message: 'Email delivery is unavailable. Try again later',
  },
  AUTH_SMS_UNAVAILABLE: { status: 503, message: 'SMS delivery is unavailable. Try again later' },
} as const satisfies ErrorCatalog;

export function authError(code: keyof typeof AUTH_ERRORS): AppError {
  return new AppError(code, AUTH_ERRORS[code]);
}
