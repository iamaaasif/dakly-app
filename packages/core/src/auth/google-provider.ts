import type { GoogleIdentityDriver } from '@dakly/providers/google/google-identity-driver';
import { FakeGoogleIdentityDriver } from '@dakly/providers/google/fake-google-identity-driver';
import { GoogleTokenDriver } from '@dakly/providers/google/google-token-driver';
import { loadEnv, type Env } from '../platform/config/env';

export const GOOGLE_IDENTITY_DRIVER = Symbol('GOOGLE_IDENTITY_DRIVER');
export function createGoogleIdentityDriver(env: Env = loadEnv()): GoogleIdentityDriver {
  const driver = env.GOOGLE_IDENTITY_DRIVER ?? (env.NODE_ENV === 'production' ? 'google' : 'fake');
  if (driver === 'fake') {
    if (env.NODE_ENV === 'production')
      throw new Error('Fake Google identity is not allowed in production');
    return new FakeGoogleIdentityDriver();
  }
  if (!env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is required for Google identity');
  return new GoogleTokenDriver(env.GOOGLE_CLIENT_ID);
}
