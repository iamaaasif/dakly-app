import type { ErrorCatalog } from '../errors/app-error';

export const CRYPTO_ERRORS = {
  ENCRYPTION_FAILED: { status: 500, message: 'Unable to encrypt secret' },
  DECRYPTION_FAILED: { status: 500, message: 'Unable to decrypt secret' },
} as const satisfies ErrorCatalog;
