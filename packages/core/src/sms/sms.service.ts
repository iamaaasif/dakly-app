import { Inject, Injectable, Logger } from '@nestjs/common';

import type { SmsDriver, SmsMessage, SmsSendResult } from '@dakly/providers/sms/sms-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { SMS_DRIVER } from './sms-provider';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  constructor(@Inject(SMS_DRIVER) private readonly driver: SmsDriver) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    return measureVendorCall(this.logger, 'sms_delivery', 'SMS delivery measured', () =>
      this.driver.send(message),
    );
  }
}
