import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const BILLING_ERRORS = {
  PLAN_NOT_FOUND: { status: 404, message: 'Plan not found' },
  PLAN_NEEDS_PAYMENT: { status: 409, message: 'This plan needs payment before it can start' },
  SUBSCRIPTION_NOT_FOUND: { status: 404, message: 'This store has no plan' },
} as const satisfies ErrorCatalog;
export function billingError(code: keyof typeof BILLING_ERRORS): AppError {
  return new AppError(code, BILLING_ERRORS[code]);
}
