import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SMS_SENDER_ERRORS = {
  SMS_SENDER_ID_NOT_FOUND: { status: 404, message: 'Sender name not found' },
  SMS_SENDER_ID_ALREADY_ACTIVE: {
    status: 409,
    message: 'This store already has a sender name that is requested or approved',
  },
  SMS_SENDER_ID_ALREADY_DECIDED: {
    status: 409,
    message: 'This sender name is already approved or rejected',
  },
  SMS_SENDER_ID_NOT_APPROVED: {
    status: 409,
    message: 'A test SMS can only be sent from an approved sender name',
  },
  SMS_SENDER_TEST_RATE_LIMITED: { status: 429, message: 'Wait before sending another test SMS' },
  SMS_SENDER_TEST_PHONE_REQUIRED: {
    status: 409,
    message: 'Verify your phone number to receive a test SMS',
  },
} as const satisfies ErrorCatalog;

export function smsSenderError(code: keyof typeof SMS_SENDER_ERRORS): AppError {
  return new AppError(code, SMS_SENDER_ERRORS[code]);
}
