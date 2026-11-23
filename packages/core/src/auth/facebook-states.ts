import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { authKey } from './auth-key';
import { authError } from './auth.errors';

export type FacebookState = { termsVersion?: string; isRemembered: boolean };
const lifetimeSeconds = 600;

// The state travels through Facebook and must come back with the same browser's cookie.
@Injectable()
export class FacebookStates {
  constructor(@Inject(ValkeyClient) private readonly client: ValkeyClient) {}

  async issue(state: FacebookState): Promise<string> {
    const nonce = randomBytes(32).toString('base64url');
    await this.client.connection.set(
      authKey('facebook-state', nonce),
      JSON.stringify(state),
      'EX',
      lifetimeSeconds,
    );
    return nonce;
  }

  async consume(nonce: string): Promise<FacebookState> {
    const data = await this.client.connection.getdel(authKey('facebook-state', nonce));
    if (!data) throw authError('AUTH_FACEBOOK_STATE_INVALID');
    return JSON.parse(data) as FacebookState;
  }
}
