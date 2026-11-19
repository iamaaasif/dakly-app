import { Inject, Injectable, Logger } from '@nestjs/common';

import { paymentCallbackSchema } from '@dakly/contracts/payments';
import type { PaymentDriver } from '@dakly/providers/payment/payment-driver';

import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PAYMENT_DRIVERS } from './payment-drivers';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentCallbackVerificationService {
  private readonly logger = new Logger(PaymentCallbackVerificationService.name);

  constructor(
    @Inject(PaymentCallbacksRepository) private readonly receipts: PaymentCallbacksRepository,
    @Inject(PaymentsRepository) private readonly repository: PaymentsRepository,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(PAYMENT_DRIVERS) private readonly drivers: readonly PaymentDriver[],
  ) {}

  async process(id: string, finalAttempt: boolean) {
    const receipt = await this.receipts.findReceived(id);
    if (!receipt) return;
    const { body, headers } = receipt.payload;
    const driver = this.drivers.find((candidate) => candidate.gateway === receipt.provider);
    try {
      const verified = driver && (await this.verify(driver, Buffer.from(body, 'base64'), headers));
      if (!verified)
        this.logger.warn({ event: 'security', webhookEventId: id }, 'Payment callback rejected');
      const status = verified ? 'processed' : 'ignored';
      await this.receipts.finish(id, status, this.clock.now());
    } catch (error) {
      if (finalAttempt) await this.receipts.finish(id, 'failed', this.clock.now());
      throw error;
    }
  }

  private async verify(
    driver: PaymentDriver,
    rawBody: Buffer,
    headers: Parameters<PaymentDriver['verifyCallback']>[1],
  ) {
    const reference = driver.callbackReference(rawBody);
    if (!reference) return false;
    const route = await this.receipts.findByReference(reference);
    if (!route) return false;
    const { store_id: storeId, payment_intent_id: intentId } = route;
    const intent = await this.repository.find(storeId, intentId);
    if (intent?.gateway !== driver.gateway || intent.merchantReference !== reference) return false;

    const result =
      intent.flow === 'billing'
        ? driver.verifyCallback(rawBody, headers, { flow: 'billing' })
        : await this.verifyShop(storeId, intent, driver, { rawBody, headers });
    const callback = paymentCallbackSchema.safeParse(result);
    if (!callback.success || callback.data.merchantReference !== reference) return false;
    await this.payments.recordCallback(storeId, intentId, driver.gateway, callback.data);
    return true;
  }

  private async verifyShop(
    storeId: string,
    intent: NonNullable<Awaited<ReturnType<PaymentsRepository['find']>>>,
    driver: PaymentDriver,
    input: { rawBody: Buffer; headers: Parameters<PaymentDriver['verifyCallback']>[1] },
  ) {
    if (!intent.credentialId) return;
    const record = await this.repository.credential(storeId, intent.credentialId, driver.gateway);
    if (!record || (record.mode === 'sandbox') !== intent.isSandbox) return;
    const credentials = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'payment-gateway-credentials' },
      record,
    );
    const merchant = { flow: 'shop', mode: record.mode, credentials } as const;
    try {
      return driver.verifyCallback(input.rawBody, input.headers, merchant);
    } finally {
      credentials.fill(0);
    }
  }
}
