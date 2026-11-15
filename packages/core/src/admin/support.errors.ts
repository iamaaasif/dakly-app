import { AppError } from '../platform/errors/app-error';
const errors = {
  STAFF_ALERT_NOT_CONFIGURED: { status: 503, message: 'Staff alert delivery is not configured' },
  STAFF_ALERT_DELIVERY_FAILED: { status: 503, message: 'Staff alert delivery failed' },
  CONFIRMATION_INVALID: { status: 400, message: 'Review the current effect and confirm again' },
  CONFIRMATION_UNAVAILABLE: { status: 503, message: 'Effect confirmation is unavailable' },
  SUPPORT_CONTEXT_CHANGED: {
    status: 409,
    message: 'Your support access changed. Refresh before continuing.',
  },
  SUPPORT_DENIED: { status: 403, message: 'Support access is not allowed' },
  SUPPORT_ENDED: { status: 403, message: 'Support access has ended or expired' },
  SUPPORT_NOT_FOUND: { status: 404, message: 'Support request not found' },
  SUPPORT_INVALID: { status: 409, message: 'This request is no longer available' },
  SUPPORT_PHONE_REQUIRED: {
    status: 409,
    message: 'The Owner needs a verified phone to approve support',
  },
  AUDIT_EXPORT_UNAVAILABLE: { status: 404, message: 'Export is unavailable or expired' },
} as const;
export const supportError = (code: keyof typeof errors) => new AppError(code, errors[code]);

export function isSupportCodeUnavailable(error: unknown): boolean {
  return (
    error instanceof AppError &&
    [
      'AUTH_SMS_UNAVAILABLE',
      'AUTH_EMAIL_UNAVAILABLE',
      'AUTH_RATE_LIMITED',
      'AUTH_LOCKED',
      'SUPPORT_PHONE_REQUIRED',
    ].includes(error.code)
  );
}
