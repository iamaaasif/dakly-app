import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const ORDER_ERRORS = {
  ORDER_TOTAL_INVALID: {
    status: 400,
    message: 'Order totals are too large or a line discount exceeds its price',
  },
  ORDER_PRICE_REQUIRED: { status: 409, message: 'Set a price for each item before ordering' },
  ORDER_NOT_FOUND: { status: 404, message: 'Order not found' },
  ORDER_STAGE_NOT_ALLOWED: { status: 409, message: 'This order cannot move to that stage' },
} as const satisfies ErrorCatalog;

export function orderError(code: keyof typeof ORDER_ERRORS): AppError {
  return new AppError(code, ORDER_ERRORS[code]);
}
