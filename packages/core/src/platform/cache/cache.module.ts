import { Module } from '@nestjs/common';

import { loadEnv } from '../config/env';
import { RateLimiter } from './rate-limiter';
import { ValkeyClient } from './valkey-client';

@Module({
  providers: [
    { provide: ValkeyClient, useFactory: () => new ValkeyClient(loadEnv().REDIS_URL) },
    RateLimiter,
  ],
  exports: [ValkeyClient, RateLimiter],
})
export class CacheModule {}
