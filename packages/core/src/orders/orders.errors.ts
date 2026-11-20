import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const ORDER_ERRORS = {
  PRODUCT_HAS_OPEN_ORDERS: {
    status: 409,
    message: 'Finish or cancel open orders before archiving this product',
  },
  ORDER_TOTAL_INVALID: {
    status: 400,
    message: 'Order totals are too large or a line discount exceeds its price',
  },
  ORDER_PRICE_REQUIRED: { status: 409, message: 'Set a price for each item before ordering' },
  ORDER_CHANGED: {
    status: 409,
    message: 'This order changed. Close the form and reopen it to edit.',
  },
  ORDER_NOT_EDITABLE: { status: 409, message: 'This order can no longer be edited' },
  ORDER_ADVANCE_ALREADY_PAID: { status: 409, message: 'An advance has already been recorded' },
  ORDER_DELIVERED_QUANTITY_INVALID: {
    status: 400,
    message: 'Enter a valid delivered quantity for every item',
  },
  ORDER_COD_NOT_COLLECTABLE: { status: 409, message: 'COD cannot be recorded for this order' },
  ORDER_NOT_FOUND: { status: 404, message: 'Order not found' },
  ORDER_CONFIRMATION_RATE_LIMITED: {
    status: 429,
    message: 'Too many taps. Try again in a minute',
  },
  ORDER_STAGE_NOT_ALLOWED: { status: 409, message: 'This order cannot move to that stage' },
} as const satisfies ErrorCatalog;

export function orderError(code: keyof typeof ORDER_ERRORS): AppError {
  return new AppError(code, ORDER_ERRORS[code]);
}
