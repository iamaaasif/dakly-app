import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const DELIVERY_ERRORS = {
  DELIVERY_ZONE_NOT_FOUND: { status: 404, message: 'Delivery zone not found' },
  DELIVERY_AREA_INVALID: { status: 400, message: 'Choose an existing district or upazila' },
  DELIVERY_AREA_TAKEN: {
    status: 409,
    message: 'This area already belongs to another delivery zone',
  },
  DELIVERY_DEFAULT_REQUIRED: { status: 409, message: 'Set another default delivery zone first' },
  DELIVERY_ZONE_IN_USE: {
    status: 409,
    message: 'Orders use this delivery zone. Edit its charges instead',
  },
  DELIVERY_ZONES_ALREADY_CONFIGURED: { status: 409, message: 'Delivery zones are already set up' },
} as const satisfies ErrorCatalog;

export function deliveryError(code: keyof typeof DELIVERY_ERRORS): AppError {
  return new AppError(code, DELIVERY_ERRORS[code]);
}
