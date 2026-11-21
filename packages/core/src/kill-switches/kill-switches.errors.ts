import { AppError } from '../platform/errors/app-error';

const errors = {
  KILL_SWITCH_ALREADY_PAUSED: { status: 409, message: 'This feature is already paused here' },
  KILL_SWITCH_NOT_PAUSED: { status: 409, message: 'This feature is not paused here' },
} as const;
export const killSwitchError = (code: keyof typeof errors) => new AppError(code, errors[code]);
