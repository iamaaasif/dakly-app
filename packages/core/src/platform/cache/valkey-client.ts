import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

import { toRedisConnection } from '../queue/redis-connection';

@Injectable()
export class ValkeyClient implements OnModuleInit, OnApplicationShutdown {
  readonly connection: Redis;
  private readonly logger = new Logger(ValkeyClient.name);

  constructor(redisUrl: string) {
    this.connection = new Redis({
      ...toRedisConnection(redisUrl),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    // ioredis otherwise writes raw connection errors directly to stderr.
    this.connection.on('error', () => this.logger.error('Valkey connection failed'));
  }

  async onModuleInit(): Promise<void> {
    await this.connection.connect();
  }

  onApplicationShutdown(): void {
    this.connection.disconnect();
  }
}
