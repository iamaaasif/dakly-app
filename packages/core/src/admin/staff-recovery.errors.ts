import { AppError } from '../platform/errors/app-error';

const errors = {
  RECOVERY_DENIED: { status: 403, message: 'Account recovery is not allowed for this identity' },
  RECOVERY_STALE: { status: 409, message: 'Recovery has changed or expired. Review it again' },
  RECOVERY_LIMIT: { status: 409, message: 'Recovery supports up to 100 shops and 1,000 Owners' },
  RECOVERY_CHECKS: {
    status: 400,
    message: 'Match the shop details before recovering this account',
  },
  RECOVERY_CONTACT: { status: 409, message: 'Every Owner needs a verified security contact' },
  RECOVERY_PROOF: { status: 400, message: 'Verify each replacement contact with its new code' },
} as const;
export const recoveryError = (code: keyof typeof errors) => new AppError(code, errors[code]);
