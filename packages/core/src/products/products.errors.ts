import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const PRODUCT_ERRORS = {
  PRODUCT_NOT_FOUND: { status: 404, message: 'Product not found' },
  PRODUCT_VARIANT_NOT_FOUND: { status: 404, message: 'Product variant not found' },
  PRODUCT_SKU_TAKEN: { status: 409, message: 'A variant with this SKU already exists' },
} as const satisfies ErrorCatalog;

export function productError(code: keyof typeof PRODUCT_ERRORS): AppError {
  return new AppError(code, PRODUCT_ERRORS[code]);
}
