import { FacebookGraphDriver } from '@dakly/providers/facebook/facebook-graph-driver';
import type { FacebookIdentityDriver } from '@dakly/providers/facebook/facebook-identity-driver';
import { FakeFacebookIdentityDriver } from '@dakly/providers/facebook/fake-facebook-identity-driver';

import { loadEnv, type Env } from '../platform/config/env';

export const FACEBOOK_IDENTITY_DRIVER = Symbol('FACEBOOK_IDENTITY_DRIVER');
const localRedirectUri = 'http://localhost:3000/api/auth/facebook/callback';

function chosenDriver(env: Env): 'fake' | 'facebook' | undefined {
  if (env.FACEBOOK_IDENTITY_DRIVER) return env.FACEBOOK_IDENTITY_DRIVER;
  if (env.META_APP_ID && env.META_APP_SECRET && env.META_LOGIN_REDIRECT_URI) return 'facebook';
  return env.NODE_ENV === 'production' ? undefined : 'fake';
}

// Without Meta settings, production has no Facebook sign-in instead of failing to start.
export function createFacebookIdentityDriver(env: Env = loadEnv()): FacebookIdentityDriver | null {
  const driver = chosenDriver(env);
  if (!driver) return null;
  if (driver === 'fake')
    return new FakeFacebookIdentityDriver(env.META_LOGIN_REDIRECT_URI ?? localRedirectUri);
  return new FacebookGraphDriver({
    appId: env.META_APP_ID!,
    appSecret: env.META_APP_SECRET!,
    redirectUri: env.META_LOGIN_REDIRECT_URI!,
  });
}
