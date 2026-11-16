import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const NOTIFICATION_ERRORS = {
  NOTIFICATION_NOT_FOUND: { status: 404, message: 'Notification not found' },
  NOTIFICATION_DONE: { status: 409, message: 'This notification is already done' },
  SNOOZE_NOT_IN_FUTURE: { status: 400, message: 'Choose a snooze time in the future' },
} as const satisfies ErrorCatalog;

export function notificationError(code: keyof typeof NOTIFICATION_ERRORS): AppError {
  return new AppError(code, NOTIFICATION_ERRORS[code]);
}
