import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const BILLING_ERRORS = {
  PLAN_NOT_FOUND: { status: 404, message: 'Plan not found' },
  PLAN_NEEDS_PAYMENT: { status: 409, message: 'This plan needs payment before it can start' },
  SUBSCRIPTION_NOT_FOUND: { status: 404, message: 'This store has no plan' },
  SUBSCRIPTION_PAYMENT_TOO_LOW: {
    status: 409,
    message: 'The payment is less than the plan price',
  },
  STORE_READ_ONLY: {
    status: 402,
    message: 'Your store is read-only because the plan is unpaid. Pay now to start again',
  },
} as const satisfies ErrorCatalog;
export function billingError(code: keyof typeof BILLING_ERRORS): AppError {
  return new AppError(code, BILLING_ERRORS[code]);
}
