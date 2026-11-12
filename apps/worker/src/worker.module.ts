import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { loadEnv } from '@dakly/core/platform/config/env';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { toRedisConnection } from '@dakly/core/platform/queue/redis-connection';

@Module({
  imports: [
    DatabaseModule,
    BullModule.forRootAsync({
      useFactory: () => ({ connection: toRedisConnection(loadEnv().REDIS_URL) }),
    }),
  ],
})
export class WorkerModule {}
