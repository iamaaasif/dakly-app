import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { BillingModule } from './billing.module';
import { ApplySubscriptionPayment } from './jobs/apply-subscription-payment.job';
import { RenewSubscriptionJob } from './jobs/renew-subscription.job';
import { SweepSubscriptionRenewalsJob } from './jobs/sweep-subscription-renewals.job';
import { SubscriptionJobsService } from './subscription-jobs.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.payments }),
    BillingModule,
    ClockModule,
    OutboxModule,
    PaymentsModule,
  ],
  providers: [
    ApplySubscriptionPayment,
    RenewSubscriptionJob,
    SubscriptionJobsService,
    SubscriptionRenewalService,
    SweepSubscriptionRenewalsJob,
  ],
})
export class BillingJobsModule {}
