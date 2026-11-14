import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleTokenDriver } from './google-token-driver';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const clientId = 'dakly-client.apps.googleusercontent.com';
function token(claims = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [
    { alg: 'RS256', kid: 'test-key' },
    {
      iss: 'https://accounts.google.com',
      aud: clientId,
      iat: now,
      exp: now + 3600,
      sub: 'private-subject',
      email: 'Private@example.test',
      email_verified: true,
      ...claims,
    },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'));
  const input = parts.join('.');
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
}
function driver() {
  // Keep the library's signature/issuer/expiry/audience verification real; isolate public-key IO.
  vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
    certs: { 'test-key': publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    format: 'PEM' as Awaited<ReturnType<OAuth2Client['getFederatedSignonCertsAsync']>>['format'],
  });
  return new GoogleTokenDriver(clientId);
}
afterEach(() => vi.restoreAllMocks());
describe('GoogleTokenDriver', () => {
  it.each([
    [{}, false],
    [{ email: 'Person@gmail.com' }, true],
    [{ hd: 'example.test' }, true],
  ])('returns verified identity and email authority', async (claims, authoritative) => {
    expect(await driver().verify(token(claims))).toEqual({
      subject: 'private-subject',
      email: ('email' in claims ? claims.email : 'Private@example.test').toLowerCase(),
      emailIsAuthoritative: authoritative,
    });
  });
  it.each([
    { aud: 'other-client' },
    { iss: 'https://attacker.test' },
    { exp: 1 },
    { email_verified: false },
    { email_verified: 'true' },
    { email: undefined },
    { sub: '' },
  ])('rejects invalid claims without leaking token content: %j', async (claims) => {
    await expect(driver().verify(token(claims))).rejects.toMatchObject({
      code: 'GOOGLE_IDENTITY_INVALID',
      message: 'Google identity could not be verified',
    });
  });
  it('rejects an invalid signature', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(driver().verify(token({}, other.privateKey))).rejects.toThrow(
      'Google identity could not be verified',
    );
  });
  it('sanitizes certificate provider failures', async () => {
    const verifier = driver();
    vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockRejectedValue(
      new Error('private-token'),
    );
    await expect(verifier.verify(token())).rejects.toMatchObject({
      code: 'GOOGLE_IDENTITY_UNAVAILABLE',
      message: 'Google identity verification is unavailable',
    });
  });
  it('bounds an unresolved certificate request to ten seconds', async () => {
    vi.useFakeTimers();
    try {
      const verifier = driver();
      vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockImplementation(
        () => new Promise(() => undefined),
      );
      const rejected = expect(verifier.verify(token())).rejects.toMatchObject({
        code: 'GOOGLE_IDENTITY_UNAVAILABLE',
        message: 'Google identity verification is unavailable',
      });
      await vi.advanceTimersByTimeAsync(10000);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });
});
