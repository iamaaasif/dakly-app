import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PAYMENT_DRIVERS, PaymentCallbacksService } from './payment-callbacks.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ClockModule],
  controllers: [PaymentCallbacksController],
  providers: [
    { provide: PAYMENT_DRIVERS, useValue: [] },
    PaymentCallbacksRepository,
    PaymentCallbacksService,
    PaymentsRepository,
    PaymentsService,
  ],
  exports: [PaymentsService, PaymentsRepository, PaymentCallbacksRepository, PAYMENT_DRIVERS],
})
export class PaymentsModule {}
