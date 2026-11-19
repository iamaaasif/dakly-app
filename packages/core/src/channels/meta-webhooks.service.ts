import { createHash, timingSafeEqual } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { MetaWebhookVerification } from '@dakly/contracts/meta-webhooks';
import {
  readMetaWebhookDelivery,
  verifyMetaWebhookSignature,
} from '@dakly/providers/channel/meta/meta-webhook';

import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { hashToken } from '../platform/crypto/token-hash';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { PROCESS_WEBHOOK_EVENT } from './jobs/process-webhook-event.job';
import { META_WEBHOOK_ERRORS } from './meta-webhooks.errors';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

@Injectable()
export class MetaWebhooksService {
  private readonly logger = new Logger(MetaWebhooksService.name);
  private readonly env = loadEnv();

  constructor(
    @Inject(MetaWebhooksRepository) private readonly repository: MetaWebhooksRepository,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.inbound) private readonly queue: Queue<{ webhookEventId: string }>,
  ) {}

  verifySubscription(input: MetaWebhookVerification): string {
    const token = this.env.META_WEBHOOK_VERIFY_TOKEN;
    if (
      !this.env.META_APP_SECRET ||
      !token ||
      !timingSafeEqual(hashToken(input['hub.verify_token']), hashToken(token))
    ) {
      throw new AppError(
        'META_WEBHOOK_VERIFICATION_REJECTED',
        META_WEBHOOK_ERRORS.META_WEBHOOK_VERIFICATION_REJECTED,
      );
    }
    return input['hub.challenge'];
  }

  async receiveDelivery(rawBody: Buffer | undefined, signature: string): Promise<void> {
    const secret = this.env.META_APP_SECRET;
    if (
      !secret ||
      !this.env.META_WEBHOOK_VERIFY_TOKEN ||
      !rawBody ||
      !verifyMetaWebhookSignature(rawBody, signature, secret)
    ) {
      this.logger.warn({ event: 'security', provider: 'meta' }, 'Meta webhook signature rejected');
      throw new AppError(
        'META_WEBHOOK_SIGNATURE_REJECTED',
        META_WEBHOOK_ERRORS.META_WEBHOOK_SIGNATURE_REJECTED,
      );
    }

    const payload = readMetaWebhookDelivery(rawBody);
    if (!payload)
      throw new AppError(
        'META_WEBHOOK_DELIVERY_INVALID',
        META_WEBHOOK_ERRORS.META_WEBHOOK_DELIVERY_INVALID,
      );

    const externalId = createHash('sha256').update(rawBody).digest('hex');
    const event = await this.repository.saveDelivery(externalId, payload, this.clock.now());
    if (!event) throw new AppError('INTERNAL_ERROR', PLATFORM_ERRORS.INTERNAL_ERROR);
    if (event.status !== 'received') return;

    await this.enqueueDelivery(event.id);
  }

  async recoverDeliveries(): Promise<void> {
    const before = new Date(this.clock.now().getTime() - MINUTE_MS);
    let page = await this.repository.listReceivedBefore(before);
    while (page.length) {
      await Promise.all(
        page.map(async ({ id }) => {
          if (!(await this.queue.getJob(id))) await this.enqueueDelivery(id);
        }),
      );
      page = await this.repository.listReceivedBefore(before, page.at(-1));
    }
  }

  async purgeDeliveries(): Promise<void> {
    const before = new Date(this.clock.now().getTime() - 7 * DAY_MS);
    let deleted: boolean;
    do {
      deleted = await this.repository.purgeFinishedBefore(before);
    } while (deleted);
  }

  private async enqueueDelivery(webhookEventId: string): Promise<void> {
    try {
      // Meta retries and recovery share the row id so BullMQ can deduplicate their adds.
      await this.queue.add(
        PROCESS_WEBHOOK_EVENT,
        { webhookEventId },
        {
          jobId: webhookEventId,
          attempts: 3,
          // The final receipt retry must follow Meta's five-second send timeout.
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 60 * 60 },
          removeOnFail: 100,
        },
      );
    } catch {
      throw new AppError(
        'META_WEBHOOK_QUEUE_UNAVAILABLE',
        META_WEBHOOK_ERRORS.META_WEBHOOK_QUEUE_UNAVAILABLE,
      );
    }
  }
}
