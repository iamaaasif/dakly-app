import { performance } from 'node:perf_hooks';

import { Inject, Injectable, Logger } from '@nestjs/common';

import type { SmsDriver, SmsMessage } from '@dakly/providers/sms/sms-driver';

import { SMS_DRIVER } from './sms-provider';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  constructor(@Inject(SMS_DRIVER) private readonly driver: SmsDriver) {}

  async send(message: SmsMessage): Promise<void> {
    const startedAt = performance.now();
    let outcome: 'success' | 'failure' = 'failure';
    try {
      await this.driver.send(message);
      outcome = 'success';
    } finally {
      this.logger.log(
        {
          event: 'metric',
          metric: 'sms_delivery',
          count: 1,
          durationMilliseconds: performance.now() - startedAt,
          outcome,
        },
        'SMS delivery measured',
      );
    }
  }
}
