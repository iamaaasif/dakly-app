import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const WALLET_ERRORS = {
  WALLET_BALANCE_TOO_LOW: { status: 409, message: 'The balance is too low for this' },
  WALLET_QUANTITY_INVALID: { status: 400, message: 'The quantity must be a whole number above 0' },
  WALLET_RESERVATION_NOT_FOUND: { status: 404, message: 'Reservation not found' },
  WALLET_RESERVATION_SETTLED: {
    status: 409,
    message: 'This reservation is already released or charged',
  },
  WALLET_CHARGE_OVER_RESERVATION: {
    status: 409,
    message: 'The charge is larger than the reservation',
  },
} as const satisfies ErrorCatalog;

export function walletError(code: keyof typeof WALLET_ERRORS): AppError {
  return new AppError(code, WALLET_ERRORS[code]);
}
