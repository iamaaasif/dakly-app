export const PAYMENT_ERRORS = {
  PAYMENT_INTENT_NOT_FOUND: { status: 404, message: 'Payment intent not found' },
  PAYMENT_CREDENTIAL_UNAVAILABLE: { status: 409, message: 'Connect this payment method first' },
  PAYMENT_EXPIRY_INVALID: { status: 400, message: 'Choose a payment expiry in the future' },
  PAYMENT_SIGNATURE_INVALID: { status: 403, message: 'Payment callback signature is invalid' },
  PAYMENT_CHECKOUT_CLOSED: { status: 409, message: 'Payment checkout is closed' },
  PAYMENT_GATEWAY_UNAVAILABLE: { status: 503, message: 'Payment gateway is unavailable' },
} as const;
