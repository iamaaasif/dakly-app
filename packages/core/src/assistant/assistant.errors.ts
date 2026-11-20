import { AppError } from '../platform/errors/app-error';

const ASSISTANT_ERRORS = {
  ASK_CREDITS_UNAVAILABLE: { status: 409, message: 'There are no Ask Dakly AI credits left' },
  ASK_UNAVAILABLE: { status: 503, message: 'Dakly AI is busy. Try again in a minute.' },
} as const;

export function assistantError(code: keyof typeof ASSISTANT_ERRORS): AppError {
  return new AppError(code, ASSISTANT_ERRORS[code]);
}
