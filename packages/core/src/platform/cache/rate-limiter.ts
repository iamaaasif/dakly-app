import { Inject, Injectable } from '@nestjs/common';
import { ValkeyClient } from './valkey-client';

type RateLimitResult = { allowed: boolean; retryAfter: number };

// Keep the count, first expiry and remaining time in one atomic operation.
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count <= tonumber(ARGV[1]) then
  return 0
end
return math.max(1, math.ceil(redis.call('PTTL', KEYS[1]) / 1000))
`;

@Injectable()
export class RateLimiter {
  constructor(@Inject(ValkeyClient) private readonly client: ValkeyClient) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const retryAfter = (await this.client.connection.eval(
      CONSUME,
      1,
      key,
      limit,
      windowSeconds,
    )) as number;
    return { allowed: retryAfter === 0, retryAfter };
  }
}
