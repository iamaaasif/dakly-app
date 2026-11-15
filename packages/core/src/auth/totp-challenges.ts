import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { authKey } from './auth-key';
import { authError } from './auth.errors';
import type { SignInRequest, SignInUser } from './sign-in';

export type TotpChallenge = {
  user: SignInUser;
  request: SignInRequest;
  state: string;
  expiresAt: number;
};
const ATTEMPT = `
local data = redis.call('HGET', KEYS[1], 'data')
if not data or redis.call('HEXISTS', KEYS[1], 'busy') == 1 then
  return nil
end
local attempts = redis.call('HINCRBY', KEYS[1], 'tries', 1)
if attempts > 5 then
  redis.call('DEL', KEYS[1]);
  return nil
end
redis.call('HSET', KEYS[1], 'busy', ARGV[1])
return data
`;
@Injectable()
export class TotpChallenges {
  constructor(
    @Inject(ValkeyClient) private readonly cache: ValkeyClient,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async issue(user: SignInUser, request: SignInRequest, state: string) {
    const challengeId = randomBytes(32).toString('base64url');
    await this.cache.connection
      .multi()
      .hset(
        authKey('totp-challenge', challengeId),
        'data',
        JSON.stringify({
          user,
          request,
          state,
          expiresAt: this.clock.now().getTime() + 300000,
        } satisfies TotpChallenge),
        'tries',
        0,
      )
      .expire(authKey('totp-challenge', challengeId), 300)
      .exec();
    return { status: 'totp_required' as const, challengeId };
  }

  async attempt(challengeId: string): Promise<TotpChallenge & { attemptId: string }> {
    const attemptId = randomBytes(32).toString('base64url');
    const data = await this.cache.connection.eval(
      ATTEMPT,
      1,
      authKey('totp-challenge', challengeId),
      attemptId,
    );
    if (typeof data !== 'string') throw authError('AUTH_TOTP_INVALID');
    const grant = JSON.parse(data) as TotpChallenge;
    if (grant.expiresAt <= this.clock.now().getTime()) throw authError('AUTH_TOTP_INVALID');
    return { ...grant, attemptId };
  }

  async release(challengeId: string, attemptId: string): Promise<void> {
    await this.cache.connection.eval(
      `
      if redis.call('HGET', KEYS[1], 'busy') ~= ARGV[1] then
        return 0
      end
      if tonumber(redis.call('HGET', KEYS[1], 'tries') or '5') >= 5 then
        redis.call('DEL', KEYS[1])
      else
        redis.call('HDEL', KEYS[1], 'busy')
      end
      return 1
    `,
      1,
      authKey('totp-challenge', challengeId),
      attemptId,
    );
  }
}
