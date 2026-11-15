import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { CloudflareAccessDriver } from './access-driver';

describe('Cloudflare Access assertions', () => {
  let key: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let driver: CloudflareAccessDriver;
  const issuer = 'https://dakly-test.cloudflareaccess.com';
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    key = pair.privateKey;
    driver = new CloudflareAccessDriver({
      issuer,
      audience: 'staff-app',
      developmentKeys: { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test' }] },
    });
  });
  const token = (
    claims: Record<string, unknown> = {},
    audience = 'staff-app',
    tokenIssuer = issuer,
  ) =>
    new SignJWT({ email: 'staff@example.test', type: 'app', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setSubject('human-123')
      .setIssuer(tokenIssuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  it('binds a signed human assertion to its email and subject', async () => {
    await expect(driver.verify(await token())).resolves.toEqual({
      subject: 'human-123',
      email: 'staff@example.test',
    });
  });
  it.each([
    ['wrong audience', {}, 'other-app', issuer],
    ['wrong issuer', {}, 'staff-app', 'https://attacker.test'],
    ['service token', { common_name: 'service', email: undefined }, 'staff-app', issuer],
    ['missing human email', { email: undefined }, 'staff-app', issuer],
    ['wrong type', { type: 'service' }, 'staff-app', issuer],
  ])('rejects %s', async (_name, claims, audience, tokenIssuer) => {
    await expect(driver.verify(await token(claims, audience, tokenIssuer))).rejects.toThrow(
      'Access assertion is invalid',
    );
  });
  it('rejects a signed assertion with a non-string subject', async () => {
    const payload: Record<string, unknown> = { sub: 42, email: 'staff@example.test', type: 'app' };
    const signed = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(issuer)
      .setAudience('staff-app')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
    await expect(driver.verify(signed)).rejects.toThrow('Access assertion is invalid');
  });
  it('rejects a forged signature and an expired token', async () => {
    const signed = await token();
    await expect(driver.verify(signed.slice(0, -8) + 'AAAAAAAA')).rejects.toThrow();
    const expired = await new SignJWT({ email: 'staff@example.test', type: 'app' })
      .setSubject('human-123')
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(issuer)
      .setAudience('staff-app')
      .setExpirationTime(1)
      .sign(key);
    await expect(driver.verify(expired)).rejects.toThrow();
  });
});
