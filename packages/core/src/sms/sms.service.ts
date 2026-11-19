import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  type SmsDriver,
  type SmsMessage,
  type SmsSendResult,
  SmsSendRefused,
} from '@dakly/providers/sms/sms-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { SMS_DRIVER } from './sms-provider';
import { smsError } from './sms.errors';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  constructor(@Inject(SMS_DRIVER) private readonly driver: SmsDriver) {}

  // A refusal leaves the driver as a core error, so no caller depends on the driver's error type.
  async send(message: SmsMessage): Promise<SmsSendResult> {
    return measureVendorCall(this.logger, 'sms_delivery', 'SMS delivery measured', () =>
      this.driver.send(message),
    ).catch((error: unknown) => {
      throw error instanceof SmsSendRefused ? smsError('SMS_SEND_REFUSED') : error;
    });
  }
}
