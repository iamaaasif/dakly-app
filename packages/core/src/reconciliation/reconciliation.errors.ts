import { AppError } from '../platform/errors/app-error';

const errors = {
  SETTLEMENT_LINE_NOT_FOUND: { status: 404, message: 'Settlement line not found' },
  SETTLEMENT_LINE_NOT_OPEN: {
    status: 409,
    message: 'This line is already matched or closed',
  },
} as const;
export const reconciliationError = (code: keyof typeof errors) => new AppError(code, errors[code]);
