import { Inject, Injectable } from '@nestjs/common';

import type { PaymentDriver, PaymentMerchant } from '@dakly/providers/payment/payment-driver';

import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { hasDatabaseTransactionScope } from '../platform/database/scoped-transactions';
import { AppError } from '../platform/errors/app-error';
import { PAYMENT_DRIVERS } from './payment-drivers';
import { PAYMENT_ERRORS } from './payments.errors';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

type Intent = NonNullable<Awaited<ReturnType<PaymentsRepository['find']>>>;

@Injectable()
export class PaymentGatewayService {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PaymentsRepository) private readonly repository: PaymentsRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(PAYMENT_DRIVERS) private readonly drivers: readonly PaymentDriver[],
  ) {}

  async verify(storeId: string, intentId: string) {
    const intent = await this.repository.find(storeId, intentId);
    if (!intent?.nextCheckAt || intent.nextCheckAt > this.clock.now()) return;
    if (!intent.gatewayPaymentId) {
      await this.payments.expire(storeId, intentId);
      return;
    }
    const gatewayPaymentId = intent.gatewayPaymentId;
    const checkedAt = intent.nextCheckAt;
    const result = await this.withMerchant(storeId, intent, (driver, merchant) =>
      driver.getStatus(gatewayPaymentId, merchant),
    ).catch(async (error: unknown) => {
      await this.payments.retryCheck(storeId, intentId, checkedAt);
      throw error;
    });
    await this.payments.applyStatus(storeId, intentId, result, checkedAt);
  }

  private async withMerchant<T>(
    storeId: string,
    intent: Intent,
    use: (driver: PaymentDriver, merchant: PaymentMerchant) => Promise<T>,
  ) {
    if (hasDatabaseTransactionScope())
      throw new AppError('PAYMENT_INSIDE_TRANSACTION', PAYMENT_ERRORS.PAYMENT_INSIDE_TRANSACTION);
    const driver = this.drivers.find((candidate) => candidate.gateway === intent.gateway);
    if (!driver)
      throw new AppError('PAYMENT_GATEWAY_UNAVAILABLE', PAYMENT_ERRORS.PAYMENT_GATEWAY_UNAVAILABLE);
    if (intent.flow === 'billing') return use(driver, { flow: 'billing' });
    const credential =
      intent.credentialId &&
      (await this.repository.credential(storeId, intent.credentialId, driver.gateway));
    if (!credential || (credential.mode === 'sandbox') !== intent.isSandbox)
      throw new AppError(
        'PAYMENT_CREDENTIAL_UNAVAILABLE',
        PAYMENT_ERRORS.PAYMENT_CREDENTIAL_UNAVAILABLE,
      );
    const credentials = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'payment-gateway-credentials' },
      credential,
    );
    try {
      return await use(driver, { flow: 'shop', mode: credential.mode, credentials });
    } finally {
      credentials.fill(0);
    }
  }
}
