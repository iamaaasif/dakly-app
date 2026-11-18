import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const PRODUCT_ERRORS = {
  STOCK_NOT_AVAILABLE: { status: 409, message: 'Not enough available stock' },
  STOCK_QUANTITY_INVALID: {
    status: 400,
    message: 'Invalid quantity for this stock movement',
  },
  PRODUCT_PHOTO_LIMIT: { status: 409, message: 'A product can have up to ten photos' },
  PRODUCT_PHOTO_UPLOAD_INVALID: {
    status: 400,
    message: 'Upload a photo with the expected type and size before confirming it',
  },
  PRODUCT_PHOTO_ALREADY_ADDED: { status: 409, message: 'This photo was already added' },
  PRODUCT_PHOTO_NOT_FOUND: { status: 404, message: 'Photo not found' },
  PRODUCT_PHOTO_ORDER_INVALID: { status: 400, message: 'Include every product photo once' },
  PRODUCT_NOT_FOUND: { status: 404, message: 'Product not found' },
  PRODUCT_VARIANT_NOT_FOUND: { status: 404, message: 'Product variant not found' },
  PRODUCT_SKU_TAKEN: { status: 409, message: 'A variant with this SKU already exists' },
} as const satisfies ErrorCatalog;

export function productError(code: keyof typeof PRODUCT_ERRORS): AppError {
  return new AppError(code, PRODUCT_ERRORS[code]);
}
