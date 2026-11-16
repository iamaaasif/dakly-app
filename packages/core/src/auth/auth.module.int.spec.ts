import 'reflect-metadata';
import { setTimeout as sleep } from 'node:timers/promises';

import { getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { AuthModule } from './auth.module';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(TestModule);

describe('AuthModule', () => {
  it('starts only once the transactional queue has finished connecting', async () => {
    // A slow server answer to BullMQ's version check; ioredis's own ready check passes a callback.
    const info = Redis.prototype.info;
    vi.spyOn(Redis.prototype, 'info').mockImplementation(async function (this: Redis, ...args) {
      if (typeof args.at(-1) !== 'function') await sleep(300);
      return info.apply(this, args);
    });
    const app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    try {
      expect(app.get<Queue>(getQueueToken(QUEUES.transactional)).redisVersion).toMatch(/^\d+\./);
    } finally {
      vi.restoreAllMocks();
      await app.close();
    }
  });
});
