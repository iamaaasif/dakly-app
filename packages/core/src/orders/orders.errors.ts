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
  ORDER_LINK_NOT_FOUND: { status: 404, message: 'This order link does not work' },
  ORDER_LINK_RATE_LIMITED: { status: 429, message: 'Too many requests. Try again later' },
  ORDER_LINK_PHONE_LIMIT: {
    status: 429,
    message: 'This phone number has reached the daily order limit. Call the shop to order',
  },
  ORDER_LINK_BOT_CHECK_FAILED: {
    status: 400,
    message: 'We could not check that you are a person. Reload the page and try again',
  },
  ORDER_ADVANCE_REQUIRED: {
    status: 409,
    message: 'This customer must pay the delivery charge in advance before the order is confirmed',
  },
  ORDER_STAGE_NOT_ALLOWED: { status: 409, message: 'This order cannot move to that stage' },
} as const satisfies ErrorCatalog;

export function orderError(code: keyof typeof ORDER_ERRORS): AppError {
  return new AppError(code, ORDER_ERRORS[code]);
}
