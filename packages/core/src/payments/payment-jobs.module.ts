import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { ReconcilePaymentSettlementsJob } from './jobs/reconcile-payment-settlements.job';
import { SweepPaymentChecksJob } from './jobs/sweep-payment-checks.job';
import { SweepPaymentSettlementsJob } from './jobs/sweep-payment-settlements.job';
import { VerifyPaymentOnCallback } from './jobs/verify-payment-on-callback.job';
import { VerifyPaymentJob } from './jobs/verify-payment.job';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentJobsService } from './payment-jobs.service';
import { PaymentSettlementsRepository } from './payment-settlements.repository';
import { PaymentsModule } from './payments.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.payments }),
    ClockModule,
    CryptoModule,
    PaymentsModule,
    StoresModule,
  ],
  providers: [
    PaymentGatewayService,
    PaymentJobsService,
    PaymentSettlementsRepository,
    ReconcilePaymentSettlementsJob,
    SweepPaymentChecksJob,
    SweepPaymentSettlementsJob,
    VerifyPaymentJob,
    VerifyPaymentOnCallback,
  ],
  exports: [PaymentGatewayService],
})
export class PaymentJobsModule {}
