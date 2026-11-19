import { Inject, Injectable, Logger } from '@nestjs/common';

import { paymentCallbackSchema } from '@dakly/contracts/payments';
import type { PaymentDriver, PaymentGateway } from '@dakly/providers/payment/payment-driver';

import { AppError } from '../platform/errors/app-error';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PAYMENT_ERRORS } from './payments.errors';
import { PaymentsService } from './payments.service';

export const PAYMENT_DRIVERS = Symbol('PAYMENT_DRIVERS');

@Injectable()
export class PaymentCallbacksService {
  private readonly logger = new Logger(PaymentCallbacksService.name);

  constructor(
    private readonly repository: PaymentCallbacksRepository,
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_DRIVERS) private readonly drivers: readonly PaymentDriver[],
  ) {}

  async receive(
    gateway: PaymentGateway,
    rawBody: Buffer | undefined,
    headers: Parameters<PaymentDriver['verifyCallback']>[1],
  ) {
    const driver = this.drivers.find((candidate) => candidate.gateway === gateway);
    if (!driver)
      throw new AppError('PAYMENT_GATEWAY_UNAVAILABLE', PAYMENT_ERRORS.PAYMENT_GATEWAY_UNAVAILABLE);
    const verified = rawBody && driver.verifyCallback(rawBody, headers);
    const callback = paymentCallbackSchema.safeParse(verified);
    if (!callback.success) {
      this.logger.warn({ event: 'security', gateway }, 'Invalid payment callback signature');
      throw new AppError('PAYMENT_SIGNATURE_INVALID', PAYMENT_ERRORS.PAYMENT_SIGNATURE_INVALID);
    }
    const intent = await this.repository.findByReference(callback.data.merchantReference);
    if (!intent)
      throw new AppError('PAYMENT_INTENT_NOT_FOUND', PAYMENT_ERRORS.PAYMENT_INTENT_NOT_FOUND);
    await this.payments.recordCallback(
      intent.store_id,
      intent.payment_intent_id,
      gateway,
      callback.data,
    );
  }
}
