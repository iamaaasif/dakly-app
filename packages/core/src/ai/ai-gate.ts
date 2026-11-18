import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { aiTimeoutMs } from './ai.config';

type Permit = { kind: 'acquired'; ticket: string } | { kind: 'paused' } | { kind: 'busy' };

const acquirePermit = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'paused' end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[2]) >= 3 then return 'busy' end
redis.call('ZADD', KEYS[2], tonumber(ARGV[1]) + tonumber(ARGV[3]), ARGV[2])
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return 'acquired'
`;

const recordError = `
if redis.call('EXISTS', KEYS[1]) == 1 then return end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', tonumber(ARGV[1]) - 60000)
redis.call('ZADD', KEYS[2], ARGV[1], ARGV[2])
if redis.call('ZCARD', KEYS[2]) >= 3 then
  redis.call('SET', KEYS[1], '1', 'PX', 120000)
  redis.call('DEL', KEYS[2])
else
  redis.call('PEXPIRE', KEYS[2], 60000)
end
`;

@Injectable()
export class AiGate {
  private readonly prefix = `${loadEnv().QUEUE_PREFIX}:{ai}`;
  private readonly logger = new Logger(AiGate.name);

  constructor(
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async acquire(storeId: string): Promise<Permit> {
    const ticket = randomUUID();
    const kind = (await this.valkey.connection.eval(
      acquirePermit,
      2,
      `${this.prefix}:paused`,
      this.storeKey(storeId),
      this.clock.now().getTime(),
      ticket,
      aiTimeoutMs + 5000,
    )) as Permit['kind'];
    return kind === 'acquired' ? { kind, ticket } : { kind };
  }

  async isPaused(): Promise<boolean> {
    return (await this.valkey.connection.exists(`${this.prefix}:paused`)) === 1;
  }

  async recordFailure(): Promise<void> {
    try {
      await this.valkey.connection.eval(
        recordError,
        2,
        `${this.prefix}:paused`,
        `${this.prefix}:errors`,
        this.clock.now().getTime(),
        randomUUID(),
      );
    } catch {
      this.logger.warn('Could not record an AI provider failure');
    }
  }

  async release(storeId: string, ticket: string): Promise<void> {
    try {
      await this.valkey.connection.zrem(this.storeKey(storeId), ticket);
    } catch {
      // The lease expires even if Valkey is down when the call finishes.
      this.logger.warn('Could not release an AI permit');
    }
  }

  private storeKey(storeId: string): string {
    return `${this.prefix}:store:${storeId}`;
  }
}
