import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const CUSTOMER_ERRORS = {
  CUSTOMER_NOT_FOUND: { status: 404, message: 'Customer not found' },
  CUSTOMER_PHONE_TAKEN: {
    status: 409,
    message: 'A customer with this phone number already exists',
  },
} as const satisfies ErrorCatalog;

export type CustomerErrorCode = keyof typeof CUSTOMER_ERRORS;

export function customerError(code: CustomerErrorCode): AppError {
  return new AppError(code, CUSTOMER_ERRORS[code]);
}
