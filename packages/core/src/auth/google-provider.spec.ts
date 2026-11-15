import { describe, expect, it } from 'vitest';

import { GoogleTokenDriver } from '@dakly/providers/google/google-token-driver';

import { loadEnv } from '../platform/config/env';
import { createGoogleIdentityDriver } from './google-provider';

const base = loadEnv({
  DATABASE_URL: 'postgres://localhost/dakly',
  REDIS_URL: 'redis://localhost',
});
describe('Google identity driver configuration', () => {
  it.each(['development', 'test'] as const)('permits fake identities in %s', async (NODE_ENV) => {
    const driver = createGoogleIdentityDriver({ ...base, NODE_ENV });
    expect(
      await driver.verify(
        'fake-google:{"sub":"subject","email":"owner@gmail.com","email_verified":true}',
      ),
    ).toEqual({ subject: 'subject', email: 'owner@gmail.com', emailIsAuthoritative: true });
    await expect(driver.verify('invalid-token')).rejects.toMatchObject({
      code: 'GOOGLE_IDENTITY_INVALID',
    });
  });
  it('refuses a fake driver even when production factory input bypasses environment parsing', () => {
    expect(() =>
      createGoogleIdentityDriver({
        ...base,
        NODE_ENV: 'production',
        GOOGLE_IDENTITY_DRIVER: 'fake',
      }),
    ).toThrow();
  });
  it('requires the production audience when the real driver is selected by default', () => {
    expect(() => createGoogleIdentityDriver({ ...base, NODE_ENV: 'production' })).toThrow();
  });
  it('constructs the real driver with the configured audience', () => {
    expect(
      createGoogleIdentityDriver({
        ...base,
        NODE_ENV: 'production',
        GOOGLE_CLIENT_ID: 'dakly.apps.googleusercontent.com',
      }),
    ).toBeInstanceOf(GoogleTokenDriver);
  });
});
