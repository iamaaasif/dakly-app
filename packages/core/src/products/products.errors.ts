import { productNegotiationIssue, productNegotiationIssues } from '@dakly/contracts/products';

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
  PRODUCT_VARIANT_PHOTO_LIMIT: { status: 409, message: 'A variant can have up to ten photos' },
  PRODUCT_PHOTO_TAGGING_UNAVAILABLE: {
    status: 503,
    message: 'Photo tagging is not available right now',
  },
  PRODUCT_CHANGED: { status: 409, message: 'This product changed since you opened it.' },
  PRODUCT_NOT_FOUND: { status: 404, message: 'Product not found' },
  PRODUCT_VARIANT_NOT_FOUND: { status: 404, message: 'Product variant not found' },
  PRODUCT_NEGOTIATION_VARIANT_PRICE: {
    status: 400,
    message: productNegotiationIssues.PRODUCT_NEGOTIATION_VARIANT_PRICE.message,
  },
  PRODUCT_NEGOTIATION_OPENING_PRICE: {
    status: 400,
    message: productNegotiationIssues.PRODUCT_NEGOTIATION_OPENING_PRICE.message,
  },
  PRODUCT_NEGOTIATION_FLOOR_PRICE: {
    status: 400,
    message: productNegotiationIssues.PRODUCT_NEGOTIATION_FLOOR_PRICE.message,
  },
  RESTOCK_CONTACT_NOT_FOUND: { status: 404, message: 'Customer not found' },
  RESTOCK_REQUEST_NOT_FOUND: { status: 404, message: 'Restock request not found' },
  RESTOCK_VARIANT_STILL_OUT: { status: 409, message: 'This size is still out of stock' },
  RESTOCK_VARIANT_IN_STOCK: { status: 409, message: 'This size is in stock' },
  PRODUCT_SKU_TAKEN: { status: 409, message: 'A variant with this SKU already exists' },
  PRODUCT_BULK_EDIT_ROW_INVALID: {
    status: 409,
    message: 'A product changed or cannot take this edit. Reload the list and review again',
  },
  PRODUCT_BULK_EDIT_NO_CHANGE: { status: 400, message: 'Nothing would change' },
  PRODUCT_BULK_EDIT_NOT_FOUND: { status: 404, message: 'Bulk edit not found' },
  PRODUCT_BULK_EDIT_UNDO_EXPIRED: { status: 409, message: 'The 24 hours to undo have passed' },
  PRODUCT_BULK_EDIT_ALREADY_UNDONE: { status: 409, message: 'This edit was already undone' },
  PRODUCT_CATEGORY_NOT_FOUND: { status: 404, message: 'Category not found' },
  PRODUCT_CATEGORY_NAME_TAKEN: { status: 409, message: 'A category with this name already exists' },
  PRODUCT_CATEGORY_TOO_DEEP: {
    status: 400,
    message: 'A category can sit under one other category, no deeper',
  },
  PRODUCT_BRAND_NOT_FOUND: { status: 404, message: 'Brand not found' },
  PRODUCT_BRAND_NAME_TAKEN: { status: 409, message: 'A brand with this name already exists' },
  PRODUCT_CATEGORY_IN_USE: {
    status: 409,
    message: 'Move its products and sub-categories elsewhere before deleting it',
  },
  PRODUCT_BRAND_IN_USE: {
    status: 409,
    message: 'Move its products to another brand before deleting it',
  },
} as const satisfies ErrorCatalog;

export function productError(code: keyof typeof PRODUCT_ERRORS): AppError {
  return new AppError(code, PRODUCT_ERRORS[code]);
}

export function assertProductVersion<T extends { version: number; status: string }>(
  product: T | null | undefined,
  expectedVersion?: number,
): asserts product is T {
  if (!product) throw productError('PRODUCT_NOT_FOUND');
  if (expectedVersion !== undefined && expectedVersion !== product.version)
    throw productError('PRODUCT_CHANGED');
  if (product.status === 'archived') throw productError('PRODUCT_NOT_FOUND');
}

export function assertNegotiationTerms(terms: Parameters<typeof productNegotiationIssue>[0]): void {
  const issue = productNegotiationIssue(terms);
  if (issue) throw productError(issue);
}
