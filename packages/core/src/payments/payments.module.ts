import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { ProcessPaymentCallbackJob } from './jobs/process-payment-callback.job';
import { PaymentCallbackVerificationService } from './payment-callback-verification.service';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PaymentCallbacksService } from './payment-callbacks.service';
import { PAYMENT_DRIVERS } from './payment-drivers';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    CacheModule,
    ClockModule,
    NotificationsModule,
    OutboxModule,
    BullModule.registerQueueAsync({
      name: QUEUES.inbound,
      useFactory: () => {
        const env = loadEnv();
        return { connection: toRedisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX };
      },
    }),
  ],
  controllers: [PaymentCallbacksController],
  providers: [
    { provide: PAYMENT_DRIVERS, useValue: [] },
    PaymentCallbacksRepository,
    PaymentCallbacksService,
    PaymentsRepository,
    PaymentsService,
  ],
  exports: [
    PaymentsRepository,
    PaymentsService,
    PaymentCallbacksRepository,
    PaymentCallbacksService,
    PAYMENT_DRIVERS,
  ],
})
export class PaymentsModule {}

@Module({
  imports: [ClockModule, CryptoModule, PaymentsModule],
  providers: [PaymentCallbackVerificationService, ProcessPaymentCallbackJob],
})
export class PaymentCallbackWorkerModule {}
