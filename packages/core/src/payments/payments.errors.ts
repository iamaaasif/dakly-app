export const PAYMENT_ERRORS = {
  PAYMENT_INTENT_NOT_FOUND: { status: 404, message: 'Payment intent not found' },
  PAYMENT_CREDENTIAL_UNAVAILABLE: { status: 409, message: 'Connect this payment method first' },
  PAYMENT_EXPIRY_INVALID: { status: 400, message: 'Choose a payment expiry in the future' },
  PAYMENT_CALLBACK_INVALID: { status: 400, message: 'Payment callback body is required' },
  PAYMENT_CALLBACK_TOO_LARGE: { status: 413, message: 'Payment callback is too large' },
  PAYMENT_CALLBACK_RATE_LIMITED: { status: 429, message: 'Too many payment callbacks' },
  PAYMENT_INSIDE_TRANSACTION: {
    status: 500,
    message: 'Payment gateway requires a separate transaction',
  },
  PAYMENT_CHECKOUT_CLOSED: { status: 409, message: 'Payment checkout is closed' },
  PAYMENT_GATEWAY_UNAVAILABLE: { status: 503, message: 'Payment gateway is unavailable' },
} as const;
