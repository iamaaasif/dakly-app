import { createHash } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { MAX_PAYMENT_CALLBACK_BYTES } from '@dakly/contracts/payments';
import type { PaymentDriver, PaymentGateway } from '@dakly/providers/payment/payment-driver';

import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { hashToken } from '../platform/crypto/token-hash';
import { AppError } from '../platform/errors/app-error';
import { QUEUES } from '../platform/queue/queues';
import { PROCESS_PAYMENT_CALLBACK } from './jobs/process-payment-callback.job';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PAYMENT_DRIVERS } from './payment-drivers';
import { PAYMENT_ERRORS } from './payments.errors';

const rateLimited = 'PAYMENT_CALLBACK_RATE_LIMITED';

@Injectable()
export class PaymentCallbacksService {
  constructor(
    @Inject(PaymentCallbacksRepository) private readonly repository: PaymentCallbacksRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PAYMENT_DRIVERS) private readonly drivers: readonly PaymentDriver[],
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @InjectQueue(QUEUES.inbound)
    private readonly queue: Queue<{ webhookEventId: string; attemptId: string }>,
  ) {}

  async receive(
    gateway: PaymentGateway,
    rawBody: Buffer | undefined,
    headers: Parameters<PaymentDriver['verifyCallback']>[1],
    ip: string,
  ) {
    if (!rawBody?.length)
      throw new AppError('PAYMENT_CALLBACK_INVALID', PAYMENT_ERRORS.PAYMENT_CALLBACK_INVALID);
    if (rawBody.length > MAX_PAYMENT_CALLBACK_BYTES)
      throw new AppError('PAYMENT_CALLBACK_TOO_LARGE', PAYMENT_ERRORS.PAYMENT_CALLBACK_TOO_LARGE);
    const key = `payment-callback:ip:${hashToken(ip).toString('hex')}`;
    if (!(await this.limiter.consume(key, 120, 60)).allowed)
      throw new AppError(rateLimited, PAYMENT_ERRORS[rateLimited]);

    const signatureHeaders =
      this.drivers.find((driver) => driver.gateway === gateway)?.callbackHeaders ?? [];
    const allowedHeaders = Object.fromEntries(
      signatureHeaders.map((name) => [name, headers[name]]),
    );
    const attemptId = createHash('sha256').update(JSON.stringify(allowedHeaders)).digest('hex');
    const externalId = createHash('sha256').update(rawBody).digest('hex');
    const receipt = await this.repository.save(
      gateway,
      externalId,
      {
        body: rawBody.toString('base64'),
        headers: allowedHeaders,
        attemptId,
      },
      this.clock.now(),
    );
    if (receipt && !receipt.accepted) throw new AppError(rateLimited, PAYMENT_ERRORS[rateLimited]);
    if (receipt)
      await this.queue.add(
        PROCESS_PAYMENT_CALLBACK,
        { webhookEventId: receipt.id, attemptId },
        {
          jobId: `${receipt.id}-${attemptId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
  }
}
