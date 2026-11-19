import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { MetaWebhooksController } from './meta-webhooks.controller';
import { MetaWebhooksRepository } from './meta-webhooks.repository';
import { MetaWebhooksService } from './meta-webhooks.service';

@Module({
  imports: [
    ClockModule,
    BullModule.registerQueueAsync({
      name: QUEUES.inbound,
      useFactory: () => {
        const env = loadEnv();
        return {
          connection: {
            ...toRedisConnection(env.REDIS_URL),
            enableOfflineQueue: false,
            autoResendUnfulfilledCommands: false,
            commandTimeout: 1000,
            socketTimeout: 1000,
          },
          // Reject offline adds immediately and skip the startup INFO that would fail before Valkey is ready.
          skipWaitingForReady: true,
          skipVersionCheck: true,
          prefix: env.QUEUE_PREFIX,
        };
      },
    }),
  ],
  controllers: [MetaWebhooksController],
  providers: [MetaWebhooksRepository, MetaWebhooksService],
})
export class MetaWebhooksModule {}
