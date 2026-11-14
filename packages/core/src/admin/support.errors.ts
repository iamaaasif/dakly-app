import { AppError } from '../platform/errors/app-error';
const errors = {
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
