import { Inject, Injectable, Logger } from '@nestjs/common';

import type { SmsDriver, SmsMessage, SmsSendResult } from '@dakly/providers/sms/sms-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { SMS_DRIVER } from './sms-provider';

// Well under the five-minute workflow lease; a timeout is an unknown outcome the caller resends.
const SEND_TIMEOUT_MS = 30_000;

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  constructor(@Inject(SMS_DRIVER) private readonly driver: SmsDriver) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    return measureVendorCall(this.logger, 'sms_delivery', 'SMS delivery measured', async () => {
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('The SMS provider did not answer in time')),
          SEND_TIMEOUT_MS,
        );
      });
      try {
        return await Promise.race([this.driver.send(message), timedOut]);
      } finally {
        clearTimeout(timer);
      }
    });
  }
}
