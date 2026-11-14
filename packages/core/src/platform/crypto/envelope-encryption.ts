import { createCipheriv, createDecipheriv, randomBytes, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import type { EncryptionConfiguration } from '../config/encryption-config';
import { AppError } from '../errors/app-error';
import { CRYPTO_ERRORS } from './crypto.errors';

const contextSchema = z.discriminatedUnion('owner', [
  z.object({ owner: z.literal('user'), userId: z.uuid(), purpose: z.literal('totp') }),
  z.object({
    owner: z.literal('store'),
    storeId: z.uuid(),
    purpose: z.enum(['channel-access-token', 'payment-gateway-credentials', 'bkash-agreement']),
  }),
]);
export type EncryptionContext = z.infer<typeof contextSchema>;
export type EncryptedSecret = { ciphertext: Buffer; keyVersion: number };

const FORMAT_VERSION = 1;
const MAX_SECRET_BYTES = 16384;
const ENVELOPE_OVERHEAD_BYTES = 89;

function createAssociatedData(context: EncryptionContext, keyVersion: number) {
  const parsed = contextSchema.parse(context);
  const ownerId = parsed.owner === 'user' ? parsed.userId : parsed.storeId;
  const prefix = `dakly:envelope:${FORMAT_VERSION}:${keyVersion}`;
  const binding = `${parsed.owner}:${ownerId.toLowerCase()}:${parsed.purpose}`;
  return {
    wrap: Buffer.from(`${prefix}:wrap:${binding}`),
    data: Buffer.from(`${prefix}:data:${binding}`),
  };
}

function seal(key: KeyObject | Buffer, plaintext: Buffer, associatedData: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(associatedData);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

function open(key: KeyObject | Buffer, sealed: Buffer, associatedData: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12), {
    authTagLength: 16,
  });
  decipher.setAAD(associatedData);
  decipher.setAuthTag(sealed.subarray(12, 28));
  const plaintext = decipher.update(sealed.subarray(28));
  try {
    return Buffer.concat([plaintext, decipher.final()]);
  } finally {
    // Unauthenticated plaintext must not survive an authentication failure.
    plaintext.fill(0);
  }
}

export class EnvelopeEncryption {
  readonly #currentKeyVersion: number;
  readonly #masterKeys: ReadonlyMap<number, KeyObject>;

  constructor(configuration: EncryptionConfiguration | undefined) {
    if (!configuration) throw new Error('Encryption keys are required');
    this.#currentKeyVersion = configuration.currentKeyVersion;
    this.#masterKeys = new Map(configuration.masterKeys);
  }

  encrypt(context: EncryptionContext, plaintext: Buffer): EncryptedSecret {
    const dataKey = randomBytes(32);
    try {
      if (plaintext.length > MAX_SECRET_BYTES) throw new Error();
      const keyVersion = this.#currentKeyVersion;
      const masterKey = this.#masterKeys.get(keyVersion);
      if (!masterKey) throw new Error();
      const associatedData = createAssociatedData(context, keyVersion);
      return {
        keyVersion,
        ciphertext: Buffer.concat([
          Buffer.from([FORMAT_VERSION]),
          seal(masterKey, dataKey, associatedData.wrap),
          seal(dataKey, plaintext, associatedData.data),
        ]),
      };
    } catch {
      throw new AppError('ENCRYPTION_FAILED', CRYPTO_ERRORS.ENCRYPTION_FAILED);
    } finally {
      dataKey.fill(0);
    }
  }

  decrypt(context: EncryptionContext, secret: EncryptedSecret): Buffer {
    let dataKey: Buffer | undefined;
    try {
      const { ciphertext, keyVersion } = secret;
      if (
        ciphertext.length < ENVELOPE_OVERHEAD_BYTES ||
        ciphertext.length > ENVELOPE_OVERHEAD_BYTES + MAX_SECRET_BYTES ||
        ciphertext[0] !== FORMAT_VERSION
      )
        throw new Error();
      const masterKey = this.#masterKeys.get(keyVersion);
      if (!masterKey) throw new Error();
      const associatedData = createAssociatedData(context, keyVersion);
      dataKey = open(masterKey, ciphertext.subarray(1, 61), associatedData.wrap);
      return open(dataKey, ciphertext.subarray(61), associatedData.data);
    } catch {
      // OpenSSL and validation errors are not safe to expose to callers or logs.
      throw new AppError('DECRYPTION_FAILED', CRYPTO_ERRORS.DECRYPTION_FAILED);
    } finally {
      dataKey?.fill(0);
    }
  }
}
