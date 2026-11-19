import type { ErrorCatalog } from '../platform/errors/app-error';

export const META_AUTHORIZATION_ERRORS = {
  META_LOGIN_ROLE_REQUIRED: {
    status: 403,
    message: 'Only an owner or admin can connect Meta accounts',
  },
  META_LOGIN_STATE_NOT_FOUND: { status: 404, message: 'Start the Meta login again' },
  META_LOGIN_REJECTED: { status: 400, message: 'Meta login was rejected' },
  META_LOGIN_UNAVAILABLE: { status: 503, message: 'Meta login is unavailable' },
} as const satisfies ErrorCatalog;
