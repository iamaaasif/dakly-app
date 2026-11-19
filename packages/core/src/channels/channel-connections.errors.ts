import type { ErrorCatalog } from '../platform/errors/app-error';

export const CHANNEL_CONNECTION_ERRORS = {
  CHANNEL_CONNECTION_NOT_FOUND: { status: 404, message: 'Channel connection not found' },
  CHANNEL_NOT_CONNECTED: { status: 409, message: 'Channel is not connected' },
  META_CHANNEL_NOT_CONFIGURED: { status: 503, message: 'Meta channels are unavailable' },
  CHANNEL_SEND_INSIDE_TRANSACTION: { status: 500, message: 'Something went wrong' },
  CHANNEL_CONNECTION_ROLE_REQUIRED: {
    status: 403,
    message: 'Only an Owner or Admin can change channel connections',
  },
} as const satisfies ErrorCatalog;
