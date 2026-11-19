import type { ErrorCatalog } from '../platform/errors/app-error';

export const META_WEBHOOK_ERRORS = {
  META_WEBHOOK_VERIFICATION_REJECTED: { status: 403, message: 'Webhook verification rejected' },
  META_WEBHOOK_SIGNATURE_REJECTED: { status: 401, message: 'Webhook signature rejected' },
  META_WEBHOOK_DELIVERY_INVALID: { status: 400, message: 'Webhook delivery is not valid' },
} as const satisfies ErrorCatalog;
