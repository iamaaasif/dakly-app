import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import { SecurityNoticesModule } from '@dakly/core/auth/security-notices.module';
import { AccountSecurityNoticesJob } from './account-security-notices.job';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { loadEnv } from '@dakly/core/platform/config/env';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { toRedisConnection } from '@dakly/core/platform/queue/redis-connection';

@Module({
  providers: [AccountSecurityNoticesJob],
  imports: [
    LoggingModule,
    DatabaseModule,
    SecurityNoticesModule,
    BullModule.forRootAsync({
      useFactory: () => ({ connection: toRedisConnection(loadEnv().REDIS_URL) }),
    }),
  ],
})
export class WorkerModule {}
