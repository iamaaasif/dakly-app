import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  type SmsDriver,
  type SmsMessage,
  type SmsReceipt,
  type SmsReceiptStatus,
  type SmsSendResult,
  SmsSendRefused,
  SmsSendTimeout,
} from '@dakly/providers/sms/sms-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { SMS_DRIVER } from './sms-provider';
import { smsError } from './sms.errors';

// Well under the five-minute workflow lease; a timeout leaves the caller with an unknown outcome.
const SEND_TIMEOUT_MS = 30_000;

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  constructor(@Inject(SMS_DRIVER) private readonly driver: SmsDriver) {}

  async receiptStatus(receipt: SmsReceipt): Promise<SmsReceiptStatus> {
    const readReceipt = this.driver.receiptStatus?.bind(this.driver);
    if (!readReceipt) return 'unknown';
    return measureVendorCall(this.logger, 'sms_receipt', 'SMS receipt lookup measured', () =>
      readReceipt(receipt),
    ).catch(() => 'unknown');
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    return measureVendorCall(this.logger, 'sms_delivery', 'SMS delivery measured', async () => {
      const controller = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new SmsSendTimeout();
          reject(error);
          controller.abort(error);
        }, SEND_TIMEOUT_MS);
      });
      try {
        return await Promise.race([this.driver.send(message, controller.signal), timedOut]);
      } catch (error) {
        throw error instanceof SmsSendRefused ? smsError('SMS_SEND_REFUSED') : error;
      } finally {
        clearTimeout(timer);
      }
    });
  }
}
