import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AD_LINK_ERRORS = {
  AD_LINK_NOT_FOUND: { status: 404, message: 'This ad or post has no linked products' },
  AD_LINK_PRODUCT_NOT_FOUND: {
    status: 422,
    message: 'Link only active products that are shown in chats',
  },
  AD_SUGGESTION_NOT_FOUND: { status: 404, message: 'This ad has no suggested products' },
  AD_READING_UNAVAILABLE: { status: 503, message: 'The ad could not be read right now' },
} as const satisfies ErrorCatalog;

export function adLinkError(code: keyof typeof AD_LINK_ERRORS) {
  return new AppError(code, AD_LINK_ERRORS[code]);
}
