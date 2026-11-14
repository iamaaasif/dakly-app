import { createDecipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { EnvelopeEncryption, type EncryptionContext } from './envelope-encryption';

const user: EncryptionContext = {
  owner: 'user',
  userId: '018cc001-0000-7000-8000-000000000001',
  purpose: 'totp',
};
const store: EncryptionContext = {
  owner: 'store',
  storeId: '018cc001-0000-7000-8000-000000000002',
  purpose: 'channel-access-token',
};
const plaintext = Buffer.from('তথ্য: account secret');
const masterKey = randomBytes(32);

function createEncryption(keys: Record<string, Buffer> = { 1: masterKey }, current = 1) {
  const environment = loadEnv({
    DATABASE_URL: 'postgres://localhost/dakly',
    REDIS_URL: 'redis://localhost',
    ENCRYPTION_CURRENT_KEY_VERSION: String(current),
    ENCRYPTION_MASTER_KEYS: JSON.stringify(
      Object.fromEntries(
        Object.entries(keys).map(([version, key]) => [version, key.toString('base64')]),
      ),
    ),
  });
  return new EnvelopeEncryption(environment.encryption);
}

describe('EnvelopeEncryption', () => {
  it.each([user, store, { ...user, purpose: 'account-security-notice' } as EncryptionContext])(
    'round trips secret bytes for $owner $purpose ownership',
    (context) => {
      const encryption = createEncryption();
      const secret = encryption.encrypt(context, plaintext);
      expect(secret.keyVersion).toBe(1);
      expect(encryption.decrypt(context, secret)).toEqual(plaintext);
      expect(secret.ciphertext.includes(plaintext)).toBe(false);
      expect(encryption.encrypt(context, plaintext).ciphertext).not.toEqual(secret.ciphertext);
    },
  );

  it('wraps an independent random data key and authenticates both layers', () => {
    const encryption = createEncryption();
    const unwrappedKeys = [1, 2].map(() => {
      const { ciphertext } = encryption.encrypt(user, plaintext);
      expect(ciphertext[0]).toBe(1);
      const unwrap = createDecipheriv('aes-256-gcm', masterKey, ciphertext.subarray(1, 13), {
        authTagLength: 16,
      });
      unwrap.setAAD(Buffer.from(`dakly:envelope:1:1:wrap:user:${user.userId}:totp`));
      unwrap.setAuthTag(ciphertext.subarray(13, 29));
      const key = Buffer.concat([unwrap.update(ciphertext.subarray(29, 61)), unwrap.final()]);
      expect(key).toHaveLength(32);
      expect(key).not.toEqual(masterKey);
      const decrypt = createDecipheriv('aes-256-gcm', key, ciphertext.subarray(61, 73), {
        authTagLength: 16,
      });
      decrypt.setAAD(Buffer.from(`dakly:envelope:1:1:data:user:${user.userId}:totp`));
      decrypt.setAuthTag(ciphertext.subarray(73, 89));
      expect(Buffer.concat([decrypt.update(ciphertext.subarray(89)), decrypt.final()])).toEqual(
        plaintext,
      );
      return key;
    });
    expect(unwrappedKeys[0]).not.toEqual(unwrappedKeys[1]);
  });

  it('decrypts old versions after rotation and uses the selected version for new secrets', () => {
    const oldSecret = createEncryption().encrypt(user, plaintext);
    const rotated = createEncryption({ 1: masterKey, 2: randomBytes(32) }, 2);
    expect(rotated.decrypt(user, oldSecret)).toEqual(plaintext);
    const newSecret = rotated.encrypt(user, plaintext);
    expect(newSecret.keyVersion).toBe(2);
    expect(rotated.decrypt(user, newSecret)).toEqual(plaintext);
    expect(() => createEncryption().decrypt(user, newSecret)).toThrow('Unable to decrypt secret');
  });

  it.each([
    { ...user, userId: '018cc001-0000-7000-8000-000000000003' },
    { ...store, storeId: user.userId },
  ] satisfies EncryptionContext[])('rejects another owner context', (other) => {
    const encryption = createEncryption();
    expect(() => encryption.decrypt(other, encryption.encrypt(user, plaintext))).toThrow(
      'Unable to decrypt secret',
    );
  });

  it.each([
    { ...store, storeId: '018cc001-0000-7000-8000-000000000003' },
    { ...store, purpose: 'payment-gateway-credentials' },
    { ...store, purpose: 'bkash-agreement' },
  ] satisfies EncryptionContext[])('rejects another store or credential purpose', (other) => {
    const encryption = createEncryption();
    expect(() => encryption.decrypt(other, encryption.encrypt(store, plaintext))).toThrow(
      'Unable to decrypt secret',
    );
  });

  it('rejects a changed byte anywhere in the envelope', () => {
    const encryption = createEncryption();
    const secret = encryption.encrypt(user, plaintext);
    for (let offset = 0; offset < secret.ciphertext.length; offset++) {
      const ciphertext = Buffer.from(secret.ciphertext);
      ciphertext[offset] = ciphertext[offset]! ^ 1;
      expect(() => encryption.decrypt(user, { ...secret, ciphertext })).toThrow(
        'Unable to decrypt secret',
      );
    }
  });

  it('rejects wrong keys, version substitution and transplanted ciphertext', () => {
    const encryption = createEncryption({ 1: masterKey, 2: masterKey });
    const secret = encryption.encrypt(user, plaintext);
    expect(() => createEncryption({ 1: randomBytes(32) }).decrypt(user, secret)).toThrow(
      'Unable to decrypt secret',
    );
    expect(() => encryption.decrypt(user, { ...secret, keyVersion: 2 })).toThrow(
      'Unable to decrypt secret',
    );
    const other = encryption.encrypt(user, plaintext);
    const ciphertext = Buffer.concat([
      secret.ciphertext.subarray(0, 61),
      other.ciphertext.subarray(61),
    ]);
    expect(() => encryption.decrypt(user, { ...secret, ciphertext })).toThrow(
      'Unable to decrypt secret',
    );
  });

  it('rejects truncated, extended and oversized payloads', () => {
    const encryption = createEncryption();
    const secret = encryption.encrypt(user, plaintext);
    for (const ciphertext of [
      Buffer.alloc(0),
      secret.ciphertext.subarray(0, 88),
      secret.ciphertext.subarray(0, -1),
      Buffer.concat([secret.ciphertext, Buffer.from([0])]),
      Buffer.alloc(16474),
    ]) {
      expect(() => encryption.decrypt(user, { ...secret, ciphertext })).toThrow(
        'Unable to decrypt secret',
      );
    }
    expect(() => encryption.encrypt(user, Buffer.alloc(16385))).toThrow('Unable to encrypt secret');
    expect(encryption.decrypt(user, encryption.encrypt(user, Buffer.alloc(16384)))).toHaveLength(
      16384,
    );
    expect(encryption.decrypt(user, encryption.encrypt(user, Buffer.alloc(0)))).toHaveLength(0);
  });

  it('rejects invalid context identifiers without including secrets in errors', () => {
    const encryption = createEncryption();
    expect(() => encryption.encrypt({ ...user, userId: 'invalid:totp' }, plaintext)).toThrow(
      'Unable to encrypt secret',
    );
    const secret = encryption.encrypt(user, plaintext);
    try {
      encryption.decrypt({ ...user, userId: 'invalid:totp' }, secret);
      expect.fail('Decryption must fail');
    } catch (error) {
      expect(error).toMatchObject({ message: 'Unable to decrypt secret' });
      expect(JSON.stringify(error)).not.toContain(plaintext.toString());
      expect(error).not.toHaveProperty('cause');
    }
  });

  it('keeps notice payloads separate from TOTP even for the same account', () => {
    const encryption = createEncryption();
    const notice = { ...user, purpose: 'account-security-notice' } as EncryptionContext;
    const payload = encryption.encrypt(notice, plaintext);
    expect(() => encryption.decrypt(user, payload)).toThrow('Unable to decrypt secret');
  });

  it('requires configured keys when the consumer constructs the boundary', () => {
    expect(() => new EnvelopeEncryption(undefined)).toThrow('Encryption keys are required');
  });
});
