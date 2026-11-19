import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SMS_ERRORS = {
  // The provider definitely did not take the message (the SmsDriver contract).
  SMS_SEND_REFUSED: { status: 502, message: 'The SMS provider refused the message' },
} as const satisfies ErrorCatalog;

export function smsError(code: keyof typeof SMS_ERRORS): AppError {
  return new AppError(code, SMS_ERRORS[code]);
}
