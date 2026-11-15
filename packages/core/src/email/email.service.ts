import { performance } from 'node:perf_hooks';

import { Inject, Injectable, Logger } from '@nestjs/common';

import type { EmailDriver, EmailMessage } from '@dakly/providers/email/email-driver';

import { EMAIL_DRIVER } from './email-provider';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(@Inject(EMAIL_DRIVER) private readonly driver: EmailDriver) {}

  async send(message: EmailMessage): Promise<void> {
    const startedAt = performance.now();
    let outcome: 'success' | 'failure' = 'failure';
    try {
      await this.driver.send(message);
      outcome = 'success';
    } finally {
      // Fixed metric fields keep recipient data and provider errors out of aggregation.
      this.logger.log(
        {
          event: 'metric',
          metric: 'email_delivery',
          count: 1,
          durationMilliseconds: performance.now() - startedAt,
          outcome,
        },
        'Email delivery measured',
      );
    }
  }
}
