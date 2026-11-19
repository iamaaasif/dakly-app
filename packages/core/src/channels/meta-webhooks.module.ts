import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { INBOUND_QUEUE } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { MetaWebhooksController } from './meta-webhooks.controller';
import { MetaWebhooksRepository } from './meta-webhooks.repository';
import { MetaWebhooksService } from './meta-webhooks.service';

@Module({
  imports: [
    ClockModule,
    BullModule.registerQueueAsync({
      name: INBOUND_QUEUE,
      useFactory: () => {
        const env = loadEnv();
        return { connection: toRedisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX };
      },
    }),
  ],
  controllers: [MetaWebhooksController],
  providers: [MetaWebhooksRepository, MetaWebhooksService],
})
export class MetaWebhooksModule {}
